'use strict';
const http = require('http');
exports.parking = (request, response) => {
  var s = "";
  const RoadName = request.body.queryResult.parameters.RoadName;
  console.log(RoadName);
  if (RoadName === undefined) {
    response.json({ 'fulfillmentText': "不清楚你說的路喔！" });
    return
  }
  callRoadApi(RoadName).then(obj => {
    let s = "";
    if (obj.length > 0) {
      obj.map(i => {
        s += `${i.rd_name} 有${i.rd_count}格停車位。`
      })
    } else {
      s = `${RoadName} 沒有停車位了`
    }
    console.log(s)
    response.json({ 'fulfillmentText': s });

  }).catch(() => {
    response.json({ 'fulfillmentText': `出問題囉!晚點再試` });
  })
}

var callRoadApi = (roadName) => {
  return new Promise((resolve, reject) => {
    // let path = "http://data.tycg.gov.tw/api/v1/rest/datastore/27d2edc9-890e-4a42-bcae-6ba78dd3c331?format=json";
    http.get({ host: "data.tycg.gov.tw", path: "/api/v1/rest/datastore/27d2edc9-890e-4a42-bcae-6ba78dd3c331?format=json" }, (res) => {
      // http.get(path, res => {
      let body = ''; // var to store the response chunks
      res.on('data', (d) => { body += d; }); // store each response chunk
      res.on('end', () => {
        let response = JSON.parse(body);
        let records = response.result.records;
        let r = records.filter((n) => {
          if (n.rd_name.indexOf(roadName) > -1) {
            return n
          }
        })
        if (r.length > 0) {
          resolve(r)
        } else {
          console.log("fail it")
          reject()
        }
      });
      res.on('error', (error) => {
        console.log(`Error calling the weather API: ${error}`)
        reject();
      });
    })
  })
}
