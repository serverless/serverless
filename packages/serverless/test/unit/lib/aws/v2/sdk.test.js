import net from 'net'
import { Readable } from 'stream'
import AWS, { drainBufferedOnRead } from '../../../../../lib/aws/v2/sdk.js'

// Behaves like a Node.js 26 response stream: read() without a size returns
// only the first buffered chunk.
class SingleChunkReadable extends Readable {
  constructor() {
    super({ read() {} })
    this.chunkSizes = []
  }

  push(chunk) {
    if (chunk) this.chunkSizes.push(chunk.length)
    return super.push(chunk)
  }

  read(size) {
    const data = super.read(
      size === undefined && this.chunkSizes.length ? this.chunkSizes[0] : size,
    )
    if (data !== null && size === undefined) this.chunkSizes.shift()
    return data
  }
}

// Reads the way aws-sdk v2 does: a single read() per 'readable' event.
const consumeLikeSdk = (stream, waitMs = 200) =>
  new Promise((resolve) => {
    let received = ''
    stream.on('readable', () => {
      const data = stream.read()
      if (data !== null) received += data.toString()
    })
    stream.on('end', () => resolve({ ended: true, received }))
    setTimeout(() => resolve({ ended: false, received }), waitMs)
  })

const pushChunksAndEnd = (stream, chunks) =>
  setImmediate(() => {
    for (const chunk of chunks) stream.push(Buffer.from(chunk))
    stream.push(null)
  })

describe('aws-sdk v2 response reading', () => {
  const chunks = ['<a>', 'b', 'c', '</a>']

  it('stalls without draining when the last chunks and the end arrive together', async () => {
    const stream = new SingleChunkReadable()
    pushChunksAndEnd(stream, chunks)
    const { ended } = await consumeLikeSdk(stream)
    expect(ended).toBe(false)
  })

  it('reads every buffered chunk and ends when draining', async () => {
    const stream = new SingleChunkReadable()
    drainBufferedOnRead(stream)
    pushChunksAndEnd(stream, chunks)
    expect(await consumeLikeSdk(stream)).toEqual({
      ended: true,
      received: chunks.join(''),
    })
  })

  it('keeps read(size) unchanged', () => {
    const stream = new SingleChunkReadable()
    drainBufferedOnRead(stream)
    stream.push(Buffer.from('abcdef'))
    expect(stream.read(2).toString()).toBe('ab')
  })

  it('keeps reads in flowing mode unchanged', async () => {
    const stream = new SingleChunkReadable()
    drainBufferedOnRead(stream)
    const received = []
    const ended = new Promise((resolve) => stream.on('end', resolve))
    stream.on('data', (data) => received.push(data.toString()))
    pushChunksAndEnd(stream, chunks)
    await ended
    expect(received).toEqual(chunks)
  })

  it('keeps pause() effective in flowing mode', async () => {
    const stream = new Readable({ read() {} })
    drainBufferedOnRead(stream)
    for (let i = 0; i < 10; i++) stream.push(Buffer.from(String(i)))
    let dataEvents = 0
    stream.on('data', () => {
      dataEvents += 1
      stream.pause()
    })
    await new Promise((resolve) => setImmediate(resolve))
    expect(dataEvents).toBe(1)
  })

  describe('requests', () => {
    const listBody =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">' +
      '<Name>bucket</Name><KeyCount>40</KeyCount><MaxKeys>1000</MaxKeys>' +
      '<IsTruncated>false</IsTruncated>' +
      Array.from(
        { length: 40 },
        (_, i) =>
          `<Contents><Key>serverless/service/dev/${i}.zip</Key><Size>1</Size></Contents>`,
      ).join('') +
      '</ListBucketResult>'

    // Sends the whole chunked response, including its end, in a single write,
    // so the client receives every chunk and the end of the body together.
    const respondInOneWrite = (body, contentType) => {
      const chunkSize = 256
      let encoded = ''
      for (let i = 0; i < body.length; i += chunkSize) {
        const chunk = body.slice(i, i + chunkSize)
        encoded += `${Buffer.byteLength(chunk).toString(16)}\r\n${chunk}\r\n`
      }
      return (
        'HTTP/1.1 200 OK\r\n' +
        `Content-Type: ${contentType}\r\n` +
        'Transfer-Encoding: chunked\r\n' +
        'Connection: close\r\n\r\n' +
        `${encoded}0\r\n\r\n`
      )
    }

    let server
    let s3

    beforeAll(async () => {
      server = net.createServer((socket) => {
        socket.once('data', () => {
          socket.end(respondInOneWrite(listBody, 'application/xml'))
        })
      })
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
      s3 = new AWS.S3({
        endpoint: `http://127.0.0.1:${server.address().port}`,
        s3ForcePathStyle: true,
        region: 'us-east-1',
        maxRetries: 0,
        credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      })
    })

    afterAll(() => new Promise((resolve) => server.close(resolve)))

    const withTimeout = (promise) =>
      Promise.race([
        promise,
        new Promise((resolve, reject) => {
          setTimeout(
            () => reject(new Error('The request did not settle')),
            2000,
          ).unref()
        }),
      ])

    it('drains the response stream of every request', async () => {
      let responseStream
      await withTimeout(
        s3
          .listObjectsV2({ Bucket: 'bucket' })
          .on('httpHeaders', (statusCode, headers, response) => {
            responseStream = response.httpResponse.stream
          })
          .promise(),
      )
      expect(Object.hasOwn(responseStream, 'read')).toBe(true)
    })

    it('settles when a multi-chunk response arrives in one piece', async () => {
      const result = await withTimeout(
        s3.listObjectsV2({ Bucket: 'bucket' }).promise(),
      )
      expect(result.Contents).toHaveLength(40)
    })

    // createReadStream() pipes the response (flowing mode), which Node.js 26
    // reads correctly; this guards the branch that leaves it unchanged
    it('keeps createReadStream() streaming a multi-chunk response', async () => {
      const stream = s3
        .getObject({ Bucket: 'bucket', Key: 'key' })
        .createReadStream()
      const read = async () => {
        let received = ''
        for await (const chunk of stream) received += chunk.toString()
        return received
      }
      expect(await withTimeout(read())).toBe(listBody)
    })
  })
})
