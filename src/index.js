import "ol/ol.css";
import 'bootstrap/dist/css/bootstrap.css';
import * as bootstrap from 'bootstrap';
import sync from 'ol-hashed';
import { Map, View } from "ol";
import Geolocation from 'ol/Geolocation';
import TileLayer from "ol/layer/Tile";
import { fromLonLat, transform } from "ol/proj";
import XYZ from "ol/source/XYZ";
import ImageWMS from "ol/source/ImageWMS";
import TileWMS from "ol/source/TileWMS";
import GeoJSON from "ol/format/GeoJSON";
import ImageLayer from 'ol/layer/Image';
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { connect } from 'mqtt';
import Point from 'ol/geom/Point';
import { bbox as bboxStrategy } from 'ol/loadingstrategy';
import {
  Circle as CircleStyle,
  Icon,
  Fill,
  Stroke,
  Style,
  Text,
} from "ol/style.js";
import vaylaSource from "./vaylaSource.js";
import trackedVessels from "./vessels.json"
import pksUimarannatJSON from "./pks-uimarannat.json"
import pksUlkoilusaaretJSON from "./pks-ulkoilusaaret.json"
import pksVenesatamatJSON from "./pks-venesatamat.json"

let geolocation;
let DEBUG = true;

const client  = connect('wss://meri.digitraffic.fi:61619/mqtt',{username: 'digitraffic', password: 'digitrafficPassword'});

function debug(str) {
  if (DEBUG) {
    try {
      console.log(str);
    } catch (e) { };
  }
}

const darkGrayBaseLayer = new TileLayer({
  preload: Infinity,
  source: new XYZ({
    attributions:
      'Tiles © <a href="https://services.arcgisonline.com/ArcGIS/' +
      'rest/services/Canvas/World_Dark_Gray_Base/MapServer">ArcGIS</a>',
    url:
      "https://server.arcgisonline.com/ArcGIS/rest/services/" +
      "Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  }),
});

const darkGrayReferenceLayer = new TileLayer({
  source: new XYZ({
    attributions:
      'Tiles © <a href="https://services.arcgisonline.com/ArcGIS/' +
      'rest/services/Canvas/World_Dark_Gray_Reference/MapServer">ArcGIS</a>',
    url:
      "https://server.arcgisonline.com/ArcGIS/rest/services/" +
      "Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
  }),
});

function vesiliikennemerkkiIcon(feature) {
  var svg;
  var anchor = [0.0, 1.0];
  if (feature.get("VLM_LAJI") == 11) {
    svg =
      '<svg width="120" height="120" version="1.1" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="120" height="120" style="fill:rgb(255,255,255);stroke-width:30;stroke:rgb(228,0,43)" />' +
      '<text x="50%" y="50%" font-size="70px" font-family="sans-serif" dominant-baseline="central" text-anchor="middle">' +
      feature.get("RA_ARVO_T") +
      "</text> " +
      "</svg>";
  } else if (feature.get("VLM_LAJI") == 15) {
    svg =
      '<svg width="120" height="120" version="1.1" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="120" height="120" style="fill:rgb(255,255,255);stroke-width:30;stroke:rgb(228,0,43)" />' +
      '<polygon points="40,15 60,35 80,15" style="fill:black;stroke:purple;stroke-width:1" />' +
      '<text x="50%" y="50%" font-size="45px" font-family="sans-serif" dominant-baseline="central" text-anchor="middle">' +
      feature.get("RA_ARVO_T") +
      "</text> " +
      "</svg>";
    anchor = [1.0, 1.0];
  } else if (feature.get("VLM_LAJI") == 16) {
    svg =
      '<svg width="120" height="120" version="1.1" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="120" height="120" style="fill:rgb(255,255,255);stroke-width:30;stroke:rgb(228,0,43)" />' +
      '<polygon points="40,105 60,85 80,105" style="fill:black;stroke:purple;stroke-width:1" />' +
      '<text x="50%" y="50%" font-size="45px" font-family="sans-serif" dominant-baseline="central" text-anchor="middle">' +
      feature.get("RA_ARVO_T") +
      "</text> " +
      "</svg>";
  } else if (feature.get("VLM_LAJI") == 6) {
    svg =
      '<svg width="120" height="120" version="1.1" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="120" height="120" style="fill:rgb(255,255,255);stroke-width:30;stroke:rgb(228,0,43)" />' +
      '<line x1="0" y1="0" x2="120" y2="120" style="stroke:rgb(228,0,43);stroke-width:20" />' +
      '<path d="M 30 50 Q 30 60, 45 50 Q 60 40, 75 50 T 90 50" style="fill:rgb(255,255,255);stroke-width:10;stroke:rgb(0,0,0)"/>' +
      '<path d="M 30 70 Q 30 80, 45 70 Q 60 60, 75 70 T 90 70" style="fill:rgb(255,255,255);stroke-width:10;stroke:rgb(0,0,0)"/>' +
      "</svg>";
    anchor = [0.0, 0.0];
  }
  return new Style({
    image: new Icon({
      opacity: 1,
      src: "data:image/svg+xml;utf8," + svg,
      scale: 0.20,
      anchor: anchor,
    }),
  });
}

/* 
Navigointilaji (NAVL_TYYP)
0 Tuntematon
1 Vasen
2 Oikea
3 Pohjois
4 Etelä
5 Länsi
6 Itä
7 Karimerkki
8 Turvavesimerkki
9 Erikoismerkki
99 Ei sovellettavissa 
*/

function turvalaiteIcon(feature) {
  var svg = null;
  var anchor = [0.5, 1.0];
  var scale = 0.18;
  if (feature.get("NAVL_TYYP") == 1) {
    // 1 Vasen 
    svg =
      '<svg width="140" height="140" version="1.1" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M 42.5,30 L 122.5,30 L 97.5,110 L 17.5,110 L 42.5,30 z" style="fill:rgb(238,90,108);fill-opacity:1;fill-rule:evenodd;stroke:rgb(7,7,7);stroke-width:6;stroke-linecap:round;stroke-linejoin:round" />' +
      "</svg>";
    scale = 0.15;
  } else if (feature.get("NAVL_TYYP") == 2) {
    // 2 Oikea
    svg =
      '<svg width="140" height="140" version="1.1" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M 96,9 L 96,96 L 10,96 L 96,9 z" style="fill:rgb(124,240,91);fill-opacity:1;fill-rule:evenodd;stroke:rgb(7,7,7);stroke-width:6;stroke-linecap:round;stroke-linejoin:round" />' +
      "</svg>";
    scale = 0.15;
  } else if (feature.get("NAVL_TYYP") == 3) {
    // 3 Pohjois
    svg =
      '<svg width="140" height="140" version="1.1" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M 95,9 L 34,64 L 95,64 L 95,9 z M 73,76 L 12,131 L 73,131 L 73,76 z" style="fill:rgb(243,229,77);fill-opacity:1;fill-rule:evenodd;stroke:rgb(7,7,7);stroke-width:6;stroke-linecap:round;stroke-linejoin:round" />' +
      "</svg>";
  } else if (feature.get("NAVL_TYYP") == 4) {
    // 4 Etelä
    svg =
      '<svg width="140" height="140" version="1.1" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M 45,131 L 106,76 L 45,76 L 45,131 z M 67,64 L 128,9 L 67,9 L 67,64 z" style="fill:rgb(243,229,77);fill-opacity:1;fill-rule:evenodd;stroke:rgb(1,1,1);stroke-width:6;stroke-linecap:round;stroke-linejoin:round" />' +
      "</svg>";
  } else if (feature.get("NAVL_TYYP") == 5) {
    // 5 Länsi
    svg =
      '<svg width="140" height="140" version="1.1" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M 70,64 L 131,9 L 70,9 L 70,64 z M 70,76 L 9,131 L 70,131 L 70,76 z" style="fill:rgb(243,229,77);fill-opacity:1;fill-rule:evenodd;stroke:rgb(1,1,1);stroke-width:6;stroke-linecap:round;stroke-linejoin:round" />' +
      "</svg>";
  } else if (feature.get("NAVL_TYYP") == 6) {
    // 6 Itä
    svg =
      '<svg width="140" height="140" version="1.1" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M 106.5,6.5 L 45.5,61.5 L 106.5,61.5 L 106.5,6.5 z M 33.5,133.5 L 94.5,78.5 L 33.5,78.5 L 33.5,133.5 z" style="fill:rgb(243,229,77);fill-opacity:1;fill-rule:evenodd;stroke:rgb(1,1,1);stroke-width:6;stroke-linecap:round;stroke-linejoin:round" />' +
      "</svg>";
  } else if (feature.get("NAVL_TYYP") == 9) {
    // 9 Erikoismerkki
    svg =
      '<svg width="140" height="140" version="1.1" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M 56.5,30 L 83.5,30 L 83.5,110 L 56.5,110 L 56.5,30 z" style="fill:rgb(243,229,77);fill-opacity:1;fill-rule:evenodd;stroke:rgb(1,1,1);stroke-width:6;stroke-linecap:round;stroke-linejoin:round" />' +
      "</svg>";
  }

  if (svg != null) {
    return new Style({
      image: new Icon({
        opacity: 1,
        src: "data:image/svg+xml;utf8," + svg,
        scale: scale,
        anchor: anchor,
      })
    });
  } else {
    return null
  }

}

function ulkoilusaaretIcon(feature) {
  var newText = feature.get("name").replace("(saari)", "").replace("(ulkosaari)", "").split(',')[0];
  var newLength = newText.length;
  var charsPerLine = 24;
  var newEmSize = charsPerLine / newLength;
  // var textBaseSize = 16;
  var textBaseSize = 48;

  if (newEmSize < 1) {
    // Scale it
    var newFontSize = newEmSize * textBaseSize;
    // alert(newFontSize);
    var formattedSize = newFontSize + "px";
  } else {
    // It fits, leave it alone
    var newFontSize = 1;
    var formattedSize = textBaseSize + "px";
  }

  const svg =
    '<svg width="600" height="120" version="1.1" xmlns="http://www.w3.org/2000/svg">' +
    '<rect width="600" height="120" style="fill:rgb(80,80,171);stroke-width:20;stroke:rgb(255,255,255)" />' +
    '<text x="50%" y="50%" fill="white" font-size="' +
    formattedSize +
    '" font-family="sans-serif" dominant-baseline="central" text-anchor="middle">' +
    newText +
    "</text> " +
    "</svg>";
  return new Style({
    image: new Icon({
      opacity: 1,
      src: "data:image/svg+xml;utf8," + svg,
      scale: 0.25,
      //    anchor: anchor,
    }),
  });
}

function uimarantaIcon(feature) {
  var newText = feature.get("name");
  var newLength = newText.length;
  var charsPerLine = 24;
  var newEmSize = charsPerLine / newLength;
  // var textBaseSize = 16;
  var textBaseSize = 48;

  if (newEmSize < 1) {
    // Scale it
    var newFontSize = newEmSize * textBaseSize;
    // alert(newFontSize);
    var formattedSize = newFontSize + "px";
  } else {
    // It fits, leave it alone
    var newFontSize = 1;
    var formattedSize = textBaseSize + "px";
  }

  const svg =
    '<svg width="600" height="140" version="1.1" xmlns="http://www.w3.org/2000/svg">' +
    '<rect width="600" height="120" style="fill:rgb(255,255,255);stroke-width:0;stroke:rgb(255,255,255);" />' +
    '<rect x="10" y="10" width="580" height="100" style="fill:rgb(0,80,171);stroke-width:0;stroke:rgb(255,255,255);" />' +
    '<polygon points="280,120 300,140 320,120" style="fill:white;stroke:white;stroke-width:0" />' +
    '<text x="49%" y="42%" fill="white" font-size="' +
    formattedSize +
    '" font-family="sans-serif" dominant-baseline="central" text-anchor="middle">' +
    feature.get("name") +
    "</text> " +

    "</svg>";
  return new Style({
    image: new Icon({
      opacity: 1,
      src: "data:image/svg+xml;utf8," + svg,
      scale: 0.25,
      anchor: [0.5, 1.0],
    }),
  });
}

function navigointilinjaIcon(feature) {
  const svg =
    '<svg width="140" height="140" version="1.1" xmlns="http://www.w3.org/2000/svg">' +
    '<text x="50%" y="30" font-size="36px" font-family="sans-serif" font-weight="bold" fill="white" dominant-baseline="central" text-anchor="middle">' +
    Math.round(( feature.get('TOSISUUNTA') + 180 ) % 360) +
    '</text>' +
    '<path d="M 0,57 L 30,77 L 30,67 L 105,67 L 105,47 L 30,47 L 30,37 z " style="fill:rgb(238,90,108);fill-opacity:1;fill-rule:evenodd;stroke:rgb(1,1,1);stroke-width:2;stroke-linecap:round;stroke-linejoin:round" />' +
    '<path d="M 140,83 L 110,103 L 110,93 L 35,93 L 35,73 L 110,73 L 110,63 z" style="fill:rgb(124,240,91);fill-opacity:1;fill-rule:evenodd;stroke:rgb(1,1,1);stroke-width:2;stroke-linecap:round;stroke-linejoin:round" />' +
    '<text x="50%" y="110" font-size="36px" font-family="sans-serif" font-weight="bold" fill="white" dominant-baseline="central" text-anchor="middle">' +
    Math.round(feature.get('TOSISUUNTA')) +
    '</text>' +
    '</svg>';
    const first = feature.getGeometry().getFirstCoordinate();
    const last = feature.getGeometry().getLastCoordinate();

  if (map.getView().getZoom() > 12.999999) {
    return new Style({
      geometry: new Point([(first[0] + last[0]) / 2, (first[1] + last[1]) / 2]),
      image: new Icon({
        opacity: 0.7,
        src: "data:image/svg+xml;utf8," + svg,
        scale: 0.4,
        rotation: (feature.get('TOSISUUNTA') - 90) * (Math.PI / 180),
        anchor: [0.5, 0.5],
      }),
    })
  } else {
    return new Style({
      text: new Text({
        font: '12px Calibri,sans-serif',
        fill: new Fill({ color: '#fff' }),
        stroke: new Stroke({ color: '#000', width: 1 }),
        placement: "line",
        text: feature.get('TOSISUUNTA') + "° - " + Math.round((feature.get('TOSISUUNTA') + 180) % 360) * 10 / 10 + "°",
        rotation: (feature.get('TOSISUUNTA') - 90) * (Math.PI / 180),

      }),
    })
  }

}

function aisIcon(feature) {
  var headingline;
  var cogsvg;
  if (feature.get('sog') == 0) {
    headingline = "";
  } else if (feature.get('rot') < 0) {
      headingline = '<path d="M 100,75 L 148,75 L 148,60" />';
  } else if (feature.get('rot') > 0) {
      headingline = '<path d="M 100,75 L 148,75 L 148,90" />';
  } else {
    headingline = '<path d="M 100,75 L 148,75 z" />';
  }

  if (feature.get("sog") != null) {
    cogsvg = 
    '<svg width="150" height="150" version="1.1" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M 75,75 L 148,75 z" style="stroke-dasharray:5; stroke:green; stroke-width:4;" />' +
    '</svg>';
  }
  const svg =
    '<svg width="150" height="150" version="1.1" xmlns="http://www.w3.org/2000/svg">' +
    '<g stroke="green" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill-opacity="0">' +
    '<path d="M 100,75 L 50,90 L 50,60 z" style="fill:rgb(255,255,255);fill-opacity:0;fill-rule:evenodd;stroke-linejoin:round" />' +
    headingline +
    '</g>' +
    '</svg>';
  const mmsi = feature.get("mmsi") + "";
  return [new Style({
    image: new Icon({
      opacity: 1,
      src: "data:image/svg+xml;utf8," + svg,
      scale: 0.5,
      rotation: (feature.get('heading')-90) * (Math.PI/180),
      anchor: [0.5, 0.5],
    }),
    text: new Text({
      font: '10px Calibri,sans-serif',
      fill: new Fill({ color: '#fff' }),
      stroke: new Stroke({ color: '#000', width: 1 }),
      offsetX: 0,
      offsetY: 45,
      text: typeof trackedVessels[mmsi].metadata !== "undefined" ? trackedVessels[mmsi].metadata.name : mmsi
  }),
}),
  new Style({
    image: new Icon({
      opacity: 1,
      src: "data:image/svg+xml;utf8," + cogsvg,
      scale: 0.5,
      rotation: (feature.get('cog')-90) * (Math.PI/180),
      anchor: [0.5, 0.5],
    }),
  }),
]
}

function venesatamatIcon(feature) {
  var newText = feature.get("name").replace(" / Vesiliikennelaituri", "").replace(" / Venesatama", "");
  var newLength = newText.length;
  var charsPerLine = 32;
  var newEmSize = charsPerLine / newLength;
  // var textBaseSize = 16;
  var textBaseSize = 48;

  if (newEmSize < 1) {
    // Scale it
    var newFontSize = newEmSize * textBaseSize;
    // alert(newFontSize);
    var formattedSize = newFontSize + "px";
  } else {
    // It fits, leave it alone
    var newFontSize = 1;
    var formattedSize = textBaseSize + "px";
  }

  const svg =
    '<svg width="800" height="120" version="1.1" xmlns="http://www.w3.org/2000/svg">' +
    '<rect width="800" height="120" style="fill:rgb(0,97,69);stroke-width:20;stroke:rgb(255,255,255)" />' +
    '<text x="50%" y="50%" fill="white" font-size="' +
    formattedSize +
    '" font-family="sans-serif" dominant-baseline="central" text-anchor="middle">' +
    newText +
    "</text> " +
    "</svg>";
  return new Style({
    image: new Icon({
      opacity: 1,
      src: "data:image/svg+xml;utf8," + svg,
      scale: 0.25,
      //    anchor: anchor,
    }),
  });
}

const lightningStyle = new Style({
  image: new CircleStyle({
    radius: 2,
    fill: null,
    stroke: new Stroke({ color: "yellow", width: 2 }),
  }),
});

const airTemperatureStyle = new Style({
  image: new CircleStyle({
    radius: 4,
    fill: null,
    stroke: new Stroke({ color: "red", width: 2 }),
  }),
  text: new Text({
    font: "12px Calibri,sans-serif",
    fill: new Fill({
      color: "#fff",
    }),
    stroke: new Stroke({
      color: "#000",
      width: 3,
    }),
    offsetX: 0,
    offsetY: -15,
  }),
});

//
// Väylävirasto
// 

const vesiliikennemerkitLayer = new VectorLayer({
  source: new vaylaSource({ name: "vesiliikennemerkit" }),
  minZoom: 12,
  style: function (feature) {
    let laji = feature.get("VLM_LAJI");
    if (laji == 6 || laji == 11) {
      return vesiliikennemerkkiIcon(feature);
    } else {
      return null;
    }
  },
});

const vesialuerajoituksetLayer = new VectorLayer({
  source: new vaylaSource({ name: "rajoitusalue_a" }),
  minZoom: 11,
  style: function (feature) {
    let laji = feature.get("RAJOITUSTYYPIT");
    let color = "rgba(0, 0, 255, 0.3)"
    if (feature.get('NOPEUSRAJOITUS') == 10) {
      color = 'rgba(255, 0, 0, 0.3)'
    } else if (feature.get('NOPEUSRAJOITUS') <= 20) {
      color = 'rgba(0, 255, 255, 0.3)'
    }
    if ((laji == "01" || laji == "01, 02") ) {
      //if (feature.get("MERK_VAST") != null && feature.get("MERK_VAST").indexOf("ELY-keskus")) {return null}
      return new Style({
        fill: new Fill({
          color: color,
        }),
        
        text: new Text({
          font: '14px Calibri,sans-serif',
          fill: new Fill({ color: '#fff' }),
          stroke: new Stroke({
            color: '#000', width: 1
          }),
          text: feature.get('NOPEUSRAJOITUS') + "km/h"
        }),
      })
    } else {
      return null;
    }
  },
});

const vaylaalueetLayer = new VectorLayer({
  source: new vaylaSource({ name: 'vaylaalueet' }),
  minZoom: 9,
  style: new Style({ fill: new Fill({ color: 'rgba(100, 100, 100, 0.2)' }) })
});

const vaylatLayer = new VectorLayer({
  source: new vaylaSource({ name: 'vaylat' }),
  minZoom: 10,
  style: new Style({ stroke: new Stroke({ color: '#aaa', width: 1 }) })
});

const turvalaiteLayer = new VectorLayer({
  source: new vaylaSource({ name: "turvalaitteet" }),
  minZoom: 12,
  style: function (feature) { return turvalaiteIcon(feature) }
});

const navigointilinjaLayer = new VectorLayer({
  source: new vaylaSource({ name: "navigointilinjat" }),
  minZoom: 10,
  style: function (feature) {
    if ((feature.get('TOSISUUNTA') != null) && feature.getGeometry().getLength() > 0.4 * 1853 ) {
      return navigointilinjaIcon(feature)
    } else {
      return null;
    }
  },
});
        
 //       text: new Text({
 //         font: '14px Calibri,sans-serif',
  //        fill: new Fill({ color: '#ccc' }),
  //        stroke: new Stroke({
  //          color: '#000', width: 1
   //       }),
 //         placement: "line",
  //        text: feature.get('VAY_NIMISU') 
  //      }),


/* const testLayer = new navigointilinjaLayerFoo({
  minZoom: 8,
  style: function (feature) {
    let laji = feature.get("TILA");
    if ((laji == 1 && feature.get('TOSISUUNTA') != null) && feature.getGeometry().getLength() > 0.4 * 1853 ) {
      return navigointilinjaIcon(feature)
    } else {
      return null;
    }
  },
})
 */
const navigointilinjaLayerT = new VectorLayer({
  source: new vaylaSource({name: "vaylaalueet"}),
  minZoom: 8,
  style: function (feature) {
    let laji = feature.get("TILA");
    debug(feature.get('TILA'))
    if ((laji == 1) ) {
      return new Style({
        stroke: new Stroke({
          color: '#a00', width: 1,
        }),
      })
    } else {
      return null
      return new Style({
        stroke: new Stroke({
          color: '#a00', width: 1,
        }),
      })
    }
  },
})



const syvyysLayer = new VectorLayer({
  source: new VectorSource({
    format: new GeoJSON(),
    url: function (extent) {
      return (
        'https://julkinen.traficom.fi/inspirepalvelu/rajoitettu/wfs?' +
        'version=1.1.0&request=GetFeature&typename=rajoitettu:Sounding_P&' +
        'outputFormat=application/json&srsname=EPSG:3857&' +
        'bbox=' +
        extent.join(',') +
        ',EPSG:3857'
      );
    },
    strategy: bboxStrategy
  }),
  minZoom: 13,
  style: function (feature) {
    if (feature.get("DEPTH") != null ) {
      return new Style({
        text: new Text({
          font: '12px Calibri,sans-serif',
          fill: new Fill({ color: '#999' }),
          stroke: new Stroke({
            color: '#000', width: 1
          }),
          text: feature.get("DEPTH") + ""
        }),
      })
    } else {
      return null;
    }
  },
});

const windLayerBak = new VectorLayer({
  source: new VectorSource({
    format: new GeoJSON(),
    url: function (extent) {
      return (
        'https://wms.meteo.fi/geoserver/wms?' +
        'service=WMS&version=1.1.0&request=GetMap&layers=observation%3Awind_speed&' +
        'format=application%2Fjson%3Btype%3Dgeojson&srs=EPSG:3857&width=768&height=413&' +
        'bbox=' +
        extent.join(',') 
     //   ',EPSG:3857'
      );
    },
    strategy: bboxStrategy
  }),
  //minZoom: 11,
  style: function (feature) {
    debug("foo")
    debug(feature.get("ws_10min"))
    let laji = feature.get("ws_10min");
    if ((laji > 1) ) {
      return new Style({        
        text: new Text({
          font: '14px Calibri,sans-serif',
          fill: new Fill({ color: '#fff' }),
          stroke: new Stroke({ color: '#000', width: 1 }),
          text: feature.get('ws_10min') + ''
        }),
      })
    } else {
      return null;
    }
  },
});


// PKS Palvelukartta

const pksUimarannatLayer = new VectorLayer({
  source: new VectorSource({
    features: new GeoJSON({
      dataProjection: 'EPSG:4326',
      featureProjection: "EPSG:3857"
    }).readFeatures(pksUimarannatJSON),
  }),
  visible: false,
  minZoom: 12,
  style: function (feature) {
    return uimarantaIcon(feature);
  },
});

const pksUlkoilusaaretLayer = new VectorLayer({
  source: new VectorSource({
    features: new GeoJSON({
      dataProjection: 'EPSG:4326',
      featureProjection: "EPSG:3857"
    }).readFeatures(pksUlkoilusaaretJSON),
  }),
  visible: false,
  minZoom: 11,
  style: function (feature) {
    return ulkoilusaaretIcon(feature);
  },
});

const pksVenesatamatLayer = new VectorLayer({
  source: new VectorSource({
    features: new GeoJSON({
      dataProjection: 'EPSG:4326',
      featureProjection: "EPSG:3857"
    }).readFeatures(pksVenesatamatJSON),
  }),
  visible: false,
  minZoom: 11,
  style: function (feature) {
    return venesatamatIcon(feature);
  },
});

const turvalaiteviatLayer = new VectorLayer({
  source: new VectorSource({
    format: new GeoJSON(),
    url: "https://meri.digitraffic.fi/api/aton/v1/faults",
  }),
  visible: false,
  minZoom: 11,
  style: function (feature) {
    if (!feature.get("fixed") ) {
      return new Style({
        image: new CircleStyle({
          radius: 2,
          fill: null,
          stroke: new Stroke({ color: "yellow", width: 2 }),
        }),
        text: new Text({
          font: '12px Calibri,sans-serif',
          fill: new Fill({ color: '#f00' }),
          stroke: new Stroke({
            color: '#000', width: 1
          }),
          text: feature.get("type") + "\nTurvalaite: " + feature.get("aton_type") + ", " + feature.get("aton_name_fi") + "\nVäylä: " + feature.get("fairway_name_fi") + "\n" + feature.get("area_description") 
        }),
      })
    } else {
      return null;
    }
  },
});

const airTemperatureLayebak = new VectorLayer({
  source: new VectorSource({
    format: new GeoJSON(),
    url:
      "https://geoserver.apps.meteo.fi/geoserver/observation/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=observation%3Aair_temperature&maxFeatures=50&outputFormat=application%2Fjson",
  }),
  style: function (feature) {
    console.log(feature);
    airTemperatureStyle.getText().setText(feature.get("name"));
    return airTemperatureStyle;
  },
});

var lightningLayer = new VectorLayer({
  source: new VectorSource({
    format: new GeoJSON(),
    url:
      "https://geoserver.apps.meteo.fi/geoserver/observation/wms?service=WMS&" +
      "version=1.1.0&request=GetMap&layers=observation:lightning" +
      "&format=application%2Fjson%3Btype%3Dgeojson&srs=EPSG:4326" +
      "&bbox=8.349609,54.724719,35.595188,71.145195" +
      "&width=" +
      document.getElementById("map").offsetWidth +
      "&height=" +
      document.getElementById("map").offsetHeight +
      "&time=PT3H/PRESENT",
  }),
  style: function (feature) {
    console.log(feature);
    return lightningStyle;
  },
});

var radarLayerZ = new ImageLayer({
  name: "radarLayer",
  //visible: VISIBLE.has("radarLayer"),
  opacity: 0.7,
  source: new ImageWMS({
    url: 'https://wms.meteo.fi/geoserver/wms',
    params: { 'LAYERS': 'liikennevirasto.meriliikenne:merikartta' },
    attributions: 'FMI',
    //ratio: options.imageRatio,
    hidpi: false,
    serverType: 'geoserver'
  })
});

var encLayer = new ImageLayer({
  name: "encLayer",
  visible: false,
  opacity: 1,
  source: new ImageWMS({
    url: 'https://julkinen.traficom.fi/s57/wms',
    params: { 'LAYERS': 'cells' },
    attributions: 'Traficom',
    //ratio: options.imageRatio,
    hidpi: false
  })
});

var satelliteLayer = new ImageLayer({
  name: "satelliteLayer",
  visible: false,
  opacity: 0.9,
  source: new ImageWMS({
    url: 'https://view.eumetsat.int/geoserver/wms',
    params: { 'LAYERS': 'msg_fes:rgb_eview' },
    attributions: 'EUMETSAT',
    //ratio: options.imageRatio,
    hidpi: false,
    serverType: 'geoserver'
  })
});

var radarLayer = new ImageLayer({
  name: "radarLayer",
  visible: false,
  opacity: 0.7,
  source: new ImageWMS({
    url: 'https://openwms.fmi.fi/geoserver/wms',
    params: { 'LAYERS': 'Radar:suomi_dbz_eureffin' },
    attributions: 'FMI',
    //ratio: options.imageRatio,
    hidpi: false,
    serverType: 'geoserver'
  })
});

var windLayer = new ImageLayer({
  name: "windLayer",
  visible: false,
  opacity: 1,
  source: new ImageWMS({
    url: 'https://geoserver.apps.meteo.fi/geoserver/wms',
    params: { 'LAYERS': 'observation:wind_speed', 'TIME': 'PT15M/PRESENT' },
    attributions: 'FMI',
    //ratio: options.imageRatio,
    hidpi: false,
    serverType: 'geoserver'
  })
});

var gustLayer = new ImageLayer({
  name: "gustLayer",
  visible: false,
  opacity: 1,
  source: new ImageWMS({
    url: 'https://geoserver.apps.meteo.fi/geoserver/wms',
    params: { 'LAYERS': 'observation:wind_speed_of_gust', 'TIME': 'PT15M/PRESENT' },
    attributions: 'FMI',
    //ratio: options.imageRatio,
    hidpi: false,
    serverType: 'geoserver'
  })
});

var temperatureLayer = new ImageLayer({
  name: "temperatureLayer",
  visible: false,
  opacity: 1,
  source: new ImageWMS({
    url: 'https://geoserver.apps.meteo.fi/geoserver/wms',
    params: { 'LAYERS': 'observation:air_temperature', 'TIME': 'PT15M/PRESENT' },
    attributions: 'FMI',
    //ratio: options.imageRatio,
    hidpi: false,
    serverType: 'geoserver'
  })
});

var seaheightLayer = new ImageLayer({
  name: "seaheightLayer",
  visible: false,
  opacity: 1,
  source: new ImageWMS({
    url: 'https://geoserver.apps.meteo.fi/geoserver/wms',
    params: { 'LAYERS': 'observation:sea_surface_height', 'TIME': 'PT2H/PRESENT' },
    attributions: 'FMI',
    //ratio: options.imageRatio,
    hidpi: false,
    serverType: 'geoserver'
  })
});

 
var aisLayer = new VectorLayer({
	source: new VectorSource(),
	visible: true,
  style: function (feature) {
      return aisIcon(feature);
  }
});

Object.keys(trackedVessels).forEach(function (item) {
	debug("Subscribed vessel " + item + " locations");
	client.subscribe("vessels/" + item + "/+");
});

function getVesselName(mmsi) {
	if (typeof trackedVessels[mmsi].metadata !== "undefined") {
			return trackedVessels[mmsi].metadata.name;
	} else {
		return mmsi;
	}
}


client.on("message", function (topic, payload) {
	var vessel = {};
	var metadata = {};
 
	if (topic.indexOf('location') !== -1) {
		vessel = JSON.parse(payload.toString());
    
	}	
	//debug(topic);
	if (topic.indexOf('metadata') !== -1) {
		metadata = JSON.parse(payload.toString());
		trackedVessels[metadata.mmsi].metadata = metadata;
		return;
	}	
	var format = new GeoJSON({
		dataProjection: 'EPSG:4326',
		featureProjection: "EPSG:3857"
	});
	trackedVessels[vessel.mmsi].location = vessel;
	trackedVessels[vessel.mmsi].location.properties.mmsi = vessel.mmsi;
	aisLayer.getSource().clear(true);
	Object.keys(trackedVessels).forEach(function (item) {
		if (typeof trackedVessels[item].location !== "undefined") {
			aisLayer.getSource().addFeature(format.readFeature(trackedVessels[item].location));
		}
	});
	//client.end()
});


const map = new Map({
  target: "map",
  layers: [
    darkGrayBaseLayer,
    darkGrayReferenceLayer,
    encLayer,
    vesialuerajoituksetLayer,
    syvyysLayer,
    satelliteLayer,
    radarLayer,
    vaylaalueetLayer,
    vaylatLayer,
    navigointilinjaLayer,

    lightningLayer,
    turvalaiteLayer,
    vesiliikennemerkitLayer,
    pksUimarannatLayer,
    pksUlkoilusaaretLayer,
    pksVenesatamatLayer,
    turvalaiteviatLayer,
    aisLayer,
    windLayer,
    gustLayer,
    temperatureLayer,
    seaheightLayer,
  ],
  controls: [],
  view: new View({
    enableRotation: false,
    center: fromLonLat([24.983, 60.1564]),
    maxZoom: 16,
    zoom: 14,
  }),
});

function onChangeAccuracyGeometry(event) {
  debug('Accuracy geometry changed.');
  accuracyFeature.setGeometry(event.target.getAccuracyGeometry());
}

function setAllVisible(status) {
  radarLayer.setVisible(status);
  satelliteLayer.setVisible(status);
  windLayer.setVisible(status);
  gustLayer.setVisible(status);
  temperatureLayer.setVisible(status);
  seaheightLayer.setVisible(status);
  syvyysLayer.setVisible(status);
  vesialuerajoituksetLayer.setVisible(status);
  vesiliikennemerkitLayer.setVisible(status);
  navigointilinjaLayer.setVisible(status);
  pksUimarannatLayer.setVisible(status);
  pksVenesatamatLayer.setVisible(status);
  pksUlkoilusaaretLayer.setVisible(status);
  turvalaiteLayer.setVisible(status);
  turvalaiteviatLayer.setVisible(status);
  encLayer.setVisible(status);
}

const main = () => {
  // GEOLOCATION
  geolocation = new Geolocation({
    trackingOptions: {
      enableHighAccuracy: true,
    },
    projection: map.getView().getProjection(),
  });

  geolocation.on("error", function (error) {
    debug(error.message);
  });
  //geolocation.on("change:accuracyGeometry", onChangeAccuracyGeometry);
  //geolocation.on("change:position", onChangePosition);
  //geolocation.on("change:speed", onChangeSpeed);

  document.getElementById('nav').addEventListener('mouseup', function() {
    setAllVisible(false);
    aisLayer.setVisible(true);
    vesialuerajoituksetLayer.setVisible(true);
    vesiliikennemerkitLayer.setVisible(true);
    navigointilinjaLayer.setVisible(true);
    turvalaiteLayer.setVisible(true);
    syvyysLayer.setVisible(true);
  });

  document.getElementById('ais').addEventListener('mouseup', function() {
    setAllVisible(false);
    syvyysLayer.setVisible(true);
    aisLayer.setVisible(true);
  });

  document.getElementById('wind').addEventListener('mouseup', function() {
    setAllVisible(false);
    aisLayer.setVisible(true);
    windLayer.setVisible(true);
  });

  document.getElementById('gust').addEventListener('mouseup', function() {
    setAllVisible(false);
    aisLayer.setVisible(true);
    gustLayer.setVisible(true);
  });

  document.getElementById('temperature').addEventListener('mouseup', function() {
    setAllVisible(false);
    aisLayer.setVisible(true);
    temperatureLayer.setVisible(true);
  });

  document.getElementById('sea_surface_height').addEventListener('mouseup', function() {
    setAllVisible(false);
    aisLayer.setVisible(true);
    seaheightLayer.setVisible(true);
  });

  document.getElementById('radar').addEventListener('mouseup', function() {
    setAllVisible(false);
    aisLayer.setVisible(true);
    radarLayer.setVisible(true);
  });

  document.getElementById('satellite').addEventListener('mouseup', function() {
    setAllVisible(false);
    aisLayer.setVisible(true);
    satelliteLayer.setVisible(true);
  });

  document.getElementById('uimarannat').addEventListener('mouseup', function() {
    setAllVisible(false);
    aisLayer.setVisible(true);
    pksUimarannatLayer.setVisible(true);
  });

  document.getElementById('ulkoilusaaret').addEventListener('mouseup', function() {
    setAllVisible(false);
    aisLayer.setVisible(true);
    pksUlkoilusaaretLayer.setVisible(true);
  });

  document.getElementById('venesatamat').addEventListener('mouseup', function() {
    setAllVisible(false);
    aisLayer.setVisible(true);
    pksVenesatamatLayer.setVisible(true);
  });

  document.getElementById('enc').addEventListener('mouseup', function() {
    setAllVisible(false);
    aisLayer.setVisible(true);
    encLayer.setVisible(true);
  });

  document.getElementById('turvalaiteviat').addEventListener('mouseup', function() {
    setAllVisible(false);
    aisLayer.setVisible(true);
    turvalaiteviatLayer.setVisible(true);
  });

  sync(map);

};

main();