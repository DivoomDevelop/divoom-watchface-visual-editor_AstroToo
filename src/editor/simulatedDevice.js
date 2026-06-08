/** 仿真设备：不扫描 LAN，用固定 DeviceId/DeviceType 调用中国区商店 API。 */
export const SIMULATED_DEVICE_ENABLED = true;

export const SIMULATED_DEVICE = Object.freeze({
  DeviceId: 300396998,
  DeviceType: "AstroToo",
  DeviceName: "AstroToo",
  DevicePrivateIP: "",
  Hardware: 512
});

export function isSimulatedDeviceMode() {
  return SIMULATED_DEVICE_ENABLED;
}

export function getSimulatedDeviceId() {
  return SIMULATED_DEVICE_ENABLED ? Number(SIMULATED_DEVICE.DeviceId) : 0;
}

export function getSimulatedDeviceType() {
  return SIMULATED_DEVICE_ENABLED ? SIMULATED_DEVICE.DeviceType : "Frame";
}

/** @returns {typeof SIMULATED_DEVICE[]} */
export function buildSimulatedLanDeviceList() {
  if (!SIMULATED_DEVICE_ENABLED) return [];
  return [{ ...SIMULATED_DEVICE }];
}
