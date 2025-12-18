import { promises as fsp } from 'fs'
import parse from './parse.js'

async function readFile(filePath) {
  return fsp
    .readFile(filePath, 'utf8')
    .then((contents) => parse(filePath, contents))
}

export default readFile
