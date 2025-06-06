export class VesselInfoManager {
    constructor(followedList, rescueVesselManager = null) {
        this.followedList = followedList;  // Updated to use the provided list
        this.vesselsCache = {};
        this.rescueVesselManager = rescueVesselManager; // Optional rescue vessel manager
    }

    setRescueVesselManager(rescueVesselManager) {
        this.rescueVesselManager = rescueVesselManager;
    }

    isFollowed(mmsi) {
        return !!this.followedList[mmsi];
    }

    updateLocationData(mmsi, data) {
        if (!this.vesselsCache[mmsi]) {
            this.vesselsCache[mmsi] = {};
        }
        this.vesselsCache[mmsi].location = data;
    }

    updateMetadata(mmsi, metadata) {
        if (!this.vesselsCache[mmsi]) {
            this.vesselsCache[mmsi] = {};
        }
        this.vesselsCache[mmsi].metadata = metadata;
    }

    getGeoJSONForVessel(mmsi) {
        if (!this.vesselsCache[mmsi] || !this.vesselsCache[mmsi].location) {
            return null; // Location data not available yet.
        }

        const location = this.vesselsCache[mmsi].location;
        let metadata = this.vesselsCache[mmsi].metadata;

        // If metadata hasn't been received yet, try rescue vessel manager first, then followed list
        if (!metadata) {
            if (this.rescueVesselManager && this.rescueVesselManager.isRescueVessel(mmsi)) {
                const rescueVessel = this.rescueVesselManager.getRescueVessel(mmsi);
                metadata = rescueVessel?.metadata;
            } else if (this.followedList[mmsi]) {
                metadata = this.followedList[mmsi].metadata;
            }
        }

        const geoJSON = {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [location.lon, location.lat]
            },
            "properties": {
                ...location,
                ...metadata,
                "mmsi": mmsi
            }
        };
        
        return geoJSON;
    }

    handleWebsocketMessage(topic, message) {
        const topicParts = topic.split('/');
        if (topicParts.length !== 3) {
            console.error("Invalid topic format:", topic);
            return;
        }

        const mmsi = topicParts[1];
        
        if (!this.isFollowed(mmsi)) {
            return; // Ignore if not followed
        }

        if (topicParts[2] === 'location') {
            this.updateLocationData(mmsi, message);
        } else if (topicParts[2] === 'metadata') {
            this.updateMetadata(mmsi, message);
        }
    }
}


