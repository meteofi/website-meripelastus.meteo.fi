# Manual Testing Instructions for Marine Rescue Application

## Current Implementation Status: ✅ READY FOR TESTING

### Prerequisites
1. Application is running at http://localhost:1234
2. Browser developer tools are open (F12)
3. Network connectivity to Digitraffic API

### Test Sequence

#### Phase 1: Application Startup Verification
1. **Open Application**: Navigate to http://localhost:1234
2. **Check Console**: Look for these messages:
   ```
   ✓ "Connected to Digitraffic MQTT"
   ✓ "Loading rescue vessels from Digitraffic API..."
   ✓ "RescueVesselManager: Loaded X vessels from API"
   ✓ "RescueVesselManager: Found X rescue vessels:"
   ✓ "Successfully loaded and subscribed to X rescue vessels"
   ✓ "Rescue vessels initialization completed"
   ```
3. **Check for Errors**: Ensure no red error messages in console
4. **Verify UI Loading**: Check that loading status appears briefly in top-right corner

#### Phase 2: Vessel Panel Access
1. **Open Vessel Panel**: Click the location button (📍) in top-right header
2. **Verify Panel Opens**: Right panel should slide in from the right
3. **Check UI Elements**:
   - ✓ "Own Vessel" section header
   - ✓ Two buttons: "GPS" and "AIS"
   - ✓ MMSI input section (hidden initially)
   - ✓ Vessel info display (position, speed, heading)

#### Phase 3: Test Global Function (Browser Console)
1. **Open Browser Console** (F12 → Console tab)
2. **Run Test**: Type `testRescueVessels()` and press Enter
3. **Expected Output**:
   ```
   === Rescue Vessel Manager Test ===
   Statistics: {totalCount: X, loaded: true, ...}
   
   Testing MMSI 265571640:
   - Is rescue vessel: true
   - Vessel name: RESCUE VARMDO
   - Call sign: 7SA2276
   
   First 5 rescue vessels:
   - 265571640: RESCUE VARMDO (7SA2276)
   - [other rescue vessels...]
   ```

#### Phase 4: Test Rescue Vessel Input
1. **Ensure Panel is Open**: Location button should be active (highlighted)
2. **Select AIS Source**: Click "AIS" button
3. **Verify MMSI Input**: Input field should appear below AIS button
4. **Enter Test MMSI**: Type `265571640` (RESCUE VARMDO)
5. **Submit**: Click "Track" button or press Enter
6. **Expected Results**:
   - ✓ Status shows: "Tracking rescue vessel: RESCUE VARMDO"
   - ✓ Vessel name displays: "RESCUE VARMDO"
   - ✓ Call sign displays: "7SA2276"
   - ✓ MMSI displays: "265571640"
   - ✓ Status includes "Rescue vessel" indicator

#### Phase 5: Test Additional Rescue Vessels
Test with these known rescue vessel MMSIs:
- `265547750` - RESCUE 911 (SFB9893)
- `265587010` - RESCUE M WALLENBERG (7SA2310)
- `265815230` - RESCUE OLANDS BANK (7SA2036)
- `265518880` - RESCUE BURRE (7SA2186)

For each:
1. Enter MMSI in input field
2. Click "Track"
3. Verify immediate display of vessel name and call sign
4. Check for "rescue vessel" indicator in status

#### Phase 6: Test Non-Rescue Vessel
1. **Enter Regular MMSI**: Try `123456789` (not a rescue vessel)
2. **Expected Behavior**:
   - ✓ Status shows: "Tracking vessel..." (no "rescue vessel" text)
   - ✓ No immediate vessel name display
   - ✓ Would need to wait for MQTT metadata

#### Phase 7: Test GPS Functionality
1. **Select GPS Source**: Click "GPS" button
2. **Grant Location Permission**: Allow browser to access location
3. **Expected Results**:
   - ✓ GPS position updates in real-time
   - ✓ Speed and heading calculated from movement
   - ✓ Status shows "GPS active (±Xm)"
   - ✓ No vessel name/call sign shown (GPS mode)

#### Phase 8: Error Handling Test
1. **Invalid MMSI**: Enter "123" (too short)
2. **Expected**: Error message "Invalid MMSI format"
3. **Network Issues**: Disconnect internet briefly during startup
4. **Expected**: Fallback error message and offline mode

### Success Criteria
- ✅ All console messages appear without errors
- ✅ Rescue vessel data loads from API (100+ vessels)
- ✅ Vessel panel opens and functions correctly
- ✅ Rescue vessel MMSIs show immediate name/call sign
- ✅ Status messages include "rescue vessel" indicators
- ✅ GPS and AIS sources work independently
- ✅ Error handling gracefully manages invalid inputs

### Troubleshooting
If issues occur:
1. Check browser console for error messages
2. Verify network connectivity to digitraffic.fi
3. Refresh page to reload rescue vessel data
4. Test with different rescue vessel MMSIs
5. Check that MQTT connection is established

### Performance Notes
- First load may take 5-10 seconds to load all rescue vessels
- Subsequent vessel lookups should be instant
- API updates automatically every 30 minutes
- No lag when entering rescue vessel MMSIs (cached data)

---

## Implementation Complete ✅

The marine rescue application now successfully:
- Loads vessel data from Digitraffic API instead of static JSON
- Filters for rescue vessels (name contains "rescue")
- Provides instant vessel name/call sign lookup
- Subscribes to MQTT for real-time location updates
- Handles errors gracefully with user notifications
- Updates vessel data automatically every 30 minutes

All originally requested functionality has been implemented and is ready for testing.
