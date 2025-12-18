import { EventSource } from 'eventsource'
const es = new EventSource('http://localhost:3000/v1/dashboard/events')
es.addEventListener(
  'connection',
  (event) => {},
  // console.log('connection', event),
)
es.addEventListener('log', (event) => {
  const data = JSON.parse(event.data)
  console.log(JSON.stringify(data, null, 2))
})
es.addEventListener('trace', (event) => console.log('trace', event))
