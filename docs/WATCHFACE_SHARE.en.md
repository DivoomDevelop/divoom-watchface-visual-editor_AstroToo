# AstroToo watchface upload and review

The device-side protocol is defined by the AstroToo firmware source at `Z:/allwinner/AstroToo/lichee/rtos/projects/f101s3/astrotoo`. [中文版](WATCHFACE_SHARE.md)

## Use the editor

Select a real LAN device. A design without a device `ClockId` shows **Create watchface**; one with an ID shows **Apply watchface config** in the same button position. The button is disabled when the configuration has not changed. After creation, choose **Upload Watchface**. An APP preview image is required: both width and height must be at most 480 pixels. The PC tool converts it to WebP before upload. In the confirmation dialog, choose whether to share with other users. Public uploads require one template category and administrator approval; private uploads remain visible only to the owner. An unchanged watchface cannot be uploaded again.

After the first successful upload, the PC tool records online upload state against the `DeviceId` and `ClockId` pair, and the button becomes **Update online watchface**. An update requires a description, submitted in `MessageInfo`. The dialog retains the previous sharing choice and category but lets the user change them.

The device firmware must support `SupportsClockShare`. The PC tool uses real devices by default; the simulator switch remains in `src/editor/simulatedDevice.js`.

## My designs and review status

For each saved design, the left list looks up the `ClockId` bound to the selected `DeviceId`, then POSTs `Channel/GetDeviceClockInfo` with that `DeviceId` and matches `ClockId` in `ClockList`. IDs and statuses never carry over between devices. Status is refreshed after selecting or refreshing a device and after a successful upload. If the request fails, the list shows **Status unknown** instead of presenting an old value as current.

| Server `Status` | List label | Meaning |
| --- | --- | --- |
| No bound ID or online record | Local | No matching online record for this device. |
| `0` | Local | Uploaded but not public; the tooltip clarifies this. |
| `1` | Awaiting you | Public review awaits a user reply. |
| `2` | Pending review | Public review awaits the administrator. |
| `3` | Published | Approved and visible to other users. |
| `4` | Rejected | Open **Review history** for details. |

**Review history** gets the current status from `Channel/GetDeviceClockInfo` and the `ReviewList` from `Channel/GetUserClockReview` (`DeviceId`, `ClockId`). It distinguishes administrator and user messages using `IsUser`. The left-list label is a summary; the dialog retains the server's more precise status wording.

## Upload sequence and protocol

1. `Device/GetLanCapabilities` must report `SupportsClockShare: true`.
2. The PC uploads display-element assets one by one to `/upload_local_asset`: JSON `Device/UploadLocalAsset` in the first part and the image in the second. It uses each returned `local://...` reference exactly once when creating or patching the configuration. The device does not support a tar/gzip asset bundle.
3. After configuration sync, the explicitly selected APP preview is converted to WebP and uploaded. `Device/PatchLocalClockInfo` saves its `PreviewImage` local reference and `ClockName` (1–63 UTF-8 bytes). The device's local transaction preserves the previous files and configuration if this step fails.
4. The PC POSTs `/divoom_api`, for example: `{"Command":"Device/ShareLocalClock","ClockId":123,"ShareToOthers":true,"ClassifyId":30,"MessageInfo":"Changes in this update"}`. `ClassifyId` is required for public sharing. `MessageInfo` may be empty on the initial upload but is required for an update.
5. The firmware uses a SHA-256 content digest and `/userdata/lan/shared/<sha256>.id` to reuse successful uploads. Replaced files get new digests; a retry after partial failure can reuse files already uploaded successfully.
6. Once all resources succeed, the firmware sends the configuration with server FileIds through `DIVOOM_NET_COMM_DEVICE_UPDATE_CLOCK_INFO` (`Channel/Upload_device_clock_info`). It includes `Status` (`2` for public/pending administrator review, `0` for private), `ClassifyId`, and `MessageInfo`, and waits for explicit `ReturnCode: 0`. The server URLs do not replace local offline asset references. Older firmware that still sends `1` will appear as **Awaiting you** according to server semantics and must be upgraded.
7. Success returns `ReturnCode: 0, Shared: true, ClockId, Status, ClassifyId, MessageInfo, UploadedFiles, ReusedFiles, DeletedFiles`. If a file upload fails or the server does not confirm, the PC must not show upload success.

Fonts retain the firmware's existing font IDs and local resource validation; this flow does not create new cloud font IDs.

## Verification

- PC: `node scripts/test-watchface-upload.mjs`, `node scripts/test-watchface-share.mjs`, `node scripts/test-clock-review.mjs`, `npm run build`.
- Firmware Linux build host: `python3 tools/test_lan_share.py`, `python3 tools/test_lan_local.py`.
- Device acceptance: upload a watchface containing a background and image display elements; inspect `Status`, `ClassifyId`, `MessageInfo`, and resource URLs in the server request. A retry after disconnection should fail visibly, then succeed after connectivity returns. Identical files should reuse upload records; replacing images should upload new resources and delete obsolete server files.
