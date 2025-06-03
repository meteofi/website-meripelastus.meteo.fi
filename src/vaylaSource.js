import VectorSource from "ol/source/Vector";
import GeoJSON from "ol/format/GeoJSON";
import { bbox as bboxStrategy } from 'ol/loadingstrategy';

export default class navigointilinjaLayer extends VectorSource {
    constructor(opt_options) {
        const options = opt_options || {};

        super({
          format: new GeoJSON(),
          url: function (extent) {
            console.log(`Loading ${options.name} for extent:`, extent);
            // Add maxFeatures limit to improve performance
            const url = 'https://avoinapi.vaylapilvi.fi/vaylatiedot/wfs?' +
              'version=1.1.0&' +
              'request=GetFeature&' +
              'typename=vesivaylatiedot:' + options.name + '_uusi&' +
              'outputFormat=application/json&' +
              'srsname=EPSG:3857&' +
              'maxFeatures=2000&' +
              'bbox=' + extent.join(',') + ',EPSG:3857';
            console.log(`Request URL: ${url}`);
            return url;
          },
          strategy: bboxStrategy,
          // Add performance optimizations
          wrapX: false,
          // Increase loading strategy buffer for fewer requests
          // but don't preload too much data
        })
    }
}