/**
 * RescueVesselManager - Loads and manages rescue vessels from Digitraffic API
 */
export class RescueVesselManager {
    constructor() {
        this.rescueVessels = {};
        this.loading = false;
        this.loaded = false;
        this.lastUpdateTime = null;
        this.updateInterval = 30 * 60 * 1000; // Update every 30 minutes
    }

    /**
     * Load rescue vessels from Digitraffic API
     * @returns {Promise<Object>} Object with MMSI as keys and vessel metadata as values
     */
    async loadRescueVessels() {
        if (this.loading) {
            console.log('RescueVesselManager: Already loading vessels...');
            return this.rescueVessels;
        }

        console.log('RescueVesselManager: Loading rescue vessels from API...');
        this.loading = true;

        try {
            const response = await fetch('https://meri.digitraffic.fi/api/ais/v1/vessels', {
                headers: {
                    'Accept-Encoding': 'gzip'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const vessels = await response.json();
            console.log(`RescueVesselManager: Loaded ${vessels.length} vessels from API`);

            // Filter vessels that have "rescue" in the name (case insensitive)
            const rescueVessels = {};
            let rescueCount = 0;

            vessels.forEach(vessel => {
                if (vessel.name && vessel.name.toLowerCase().includes('rescue')) {
                    rescueVessels[vessel.mmsi] = {
                        metadata: {
                            name: vessel.name,
                            callsign: vessel.callSign || vessel.callsign,
                            imo: vessel.imo,
                            shipType: vessel.shipType,
                            vesselType: vessel.vesselType,
                            shipAndCargoType: vessel.shipAndCargoType,
                            destination: vessel.destination,
                            eta: vessel.eta,
                            draught: vessel.draught,
                            dimensions: vessel.dimensions
                        }
                    };
                    rescueCount++;
                }
            });

            this.rescueVessels = rescueVessels;
            this.loaded = true;
            this.lastUpdateTime = Date.now();

            console.log(`RescueVesselManager: Found ${rescueCount} rescue vessels:`, 
                Object.values(rescueVessels).map(v => v.metadata.name));

            return this.rescueVessels;

        } catch (error) {
            console.error('RescueVesselManager: Error loading rescue vessels:', error);
            this.loading = false;
            throw error;
        } finally {
            this.loading = false;
        }
    }

    /**
     * Get all rescue vessels
     * @returns {Object} Object with MMSI as keys and vessel metadata as values
     */
    getRescueVessels() {
        return this.rescueVessels;
    }

    /**
     * Get rescue vessel by MMSI
     * @param {string} mmsi - MMSI number
     * @returns {Object|null} Vessel data or null if not found
     */
    getRescueVessel(mmsi) {
        return this.rescueVessels[mmsi] || null;
    }

    /**
     * Get vessel name by MMSI (faster lookup than waiting for MQTT metadata)
     * @param {string} mmsi - MMSI number
     * @returns {string} Vessel name or MMSI if not found
     */
    getVesselName(mmsi) {
        const vessel = this.rescueVessels[mmsi];
        return vessel?.metadata?.name || mmsi;
    }

    /**
     * Get vessel call sign by MMSI
     * @param {string} mmsi - MMSI number
     * @returns {string|null} Call sign or null if not found
     */
    getVesselCallSign(mmsi) {
        const vessel = this.rescueVessels[mmsi];
        return vessel?.metadata?.callsign || null;
    }

    /**
     * Check if MMSI belongs to a rescue vessel
     * @param {string} mmsi - MMSI number
     * @returns {boolean} True if it's a rescue vessel
     */
    isRescueVessel(mmsi) {
        return !!this.rescueVessels[mmsi];
    }

    /**
     * Get array of all rescue vessel MMSIs
     * @returns {string[]} Array of MMSI numbers
     */
    getRescueVesselMMSIs() {
        return Object.keys(this.rescueVessels);
    }

    /**
     * Check if data needs to be updated
     * @returns {boolean} True if update is needed
     */
    needsUpdate() {
        if (!this.loaded || !this.lastUpdateTime) {
            return true;
        }
        return Date.now() - this.lastUpdateTime > this.updateInterval;
    }

    /**
     * Auto-update rescue vessels if needed
     * @returns {Promise<Object>} Updated rescue vessels
     */
    async autoUpdate() {
        if (this.needsUpdate()) {
            console.log('RescueVesselManager: Auto-updating rescue vessels...');
            return await this.loadRescueVessels();
        }
        return this.rescueVessels;
    }

    /**
     * Initialize rescue vessel manager
     * @returns {Promise<Object>} Loaded rescue vessels
     */
    async initialize() {
        console.log('RescueVesselManager: Initializing...');
        try {
            await this.loadRescueVessels();
            
            // Set up periodic updates
            setInterval(() => {
                this.autoUpdate().catch(error => {
                    console.error('RescueVesselManager: Auto-update failed:', error);
                });
            }, this.updateInterval);

            return this.rescueVessels;
        } catch (error) {
            console.error('RescueVesselManager: Initialization failed:', error);
            throw error;
        }
    }

    /**
     * Get statistics about loaded rescue vessels
     * @returns {Object} Statistics object
     */
    getStatistics() {
        const vessels = Object.values(this.rescueVessels);
        return {
            totalCount: vessels.length,
            loaded: this.loaded,
            loading: this.loading,
            lastUpdate: this.lastUpdateTime ? new Date(this.lastUpdateTime).toISOString() : null,
            vessels: vessels.map(v => ({
                name: v.metadata.name,
                callsign: v.metadata.callsign
            }))
        };
    }
}
