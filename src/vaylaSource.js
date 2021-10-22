import VectorSource from "ol/source/Vector";
import GeoJSON from "ol/format/GeoJSON";
import { bbox as bboxStrategy } from 'ol/loadingstrategy';

export default class navigointilinjaLayer extends VectorSource {
    constructor(opt_options) {
        const options = opt_options || {};

        super({
          format: new GeoJSON(),
          url: function (extent) {
            return (
              'https://julkinen.vayla.fi/inspirepalvelu/avoin/wfs?' +
              'version=1.1.0&' +
              'request=GetFeature&' +
              'typename=avoin:' + options.name + '&' +
              'outputFormat=application/json&' +
              'srsname=EPSG:3857&' +
              'bbox=' + extent.join(',') + ',EPSG:3857'
            );
          },
          strategy: bboxStrategy
        })
    }
}