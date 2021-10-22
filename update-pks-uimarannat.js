#!/usr/bin/env node
const request = require("request");
const fs = require("fs");

let url =
  "https://api.hel.fi/servicemap/v2/unit/?page=1&page_size=200&only=location%2Cname%2Cmunicipality%2Caccessibility_shortcoming_count%2Cservice_nodes%2Ccontract_type&geometry=true&include=service_nodes%2Cservices%2Caccessibility_properties&service_node=689%2C688";

//  let url =
//    "https://api.hel.fi/servicemap/v2/unit/?page=1&page_size=200&only=location%2Cname%2Cmunicipality%2Caccessibility_shortcoming_count%2Cservice_nodes%2Ccontract_type&geometry=true&include=service_nodes%2Cservices%2Caccessibility_properties&service_node=2142";

let options = { json: true };

request(url, options, (error, res, body) => {
  if (error) {
    return console.log(error);
  }

  if (!error && res.statusCode == 200) {
    let geojson = {};
    geojson.type = "FeatureCollection";
    geojson.features = [];
    body.results.forEach((unit) => {
      geojson.features.push({
        type: "Feature",
        geometry: unit.location,
        //properties: { name: unit.name.fi.replace(' Ry','').replace(' ry','') },
        properties: { name: unit.name.fi.replace("saari / U", "saaren u") },
      });
    });
    const data = JSON.stringify(geojson);
    fs.writeFile("dist/pks-uimarannat.json", data, (err) => {
      if (err) {
        throw err;
      }
      console.log(
        "Updated pks-uimarannat.json with total of " + body.count + " units."
      );
    });
  }
});
