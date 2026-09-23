# AstroToo 表盘上传

协议以 `Z:/allwinner/AstroToo/lichee/rtos/projects/f101s3/astrotoo` 真机源码为准。

## 使用

选择真实 LAN 设备。没有设备 `ClockId` 的设计使用「创建新表盘」；已有 `ClockId` 的设计使用同一位置的「应用表盘配置」。配置未变化时按钮不可用。创建成功后再点「上传表盘」。必须由用户选择 APP 预览图；宽、高均不得超过 480 像素，PC 上传前自动转换为 WebP。上传确认框可选择是否分享给其他用户：公开分享必须从模板分类中选择一个分类，并进入管理员审核；不公开时仅自己可用。表盘未变化时不能重复上传。

首次成功后，PC 按 `DeviceId + ClockId` 记录线上状态，按钮改为「更新线上表盘」。更新必须填写更新说明，该说明通过 `MessageInfo` 提交服务器；公开状态和模板分类会沿用上次选择，仍可在确认框中调整。

需要升级支持 `SupportsClockShare` 的真机固件。PC 默认使用真实设备列表；仿真开关仍在 `src/editor/simulatedDevice.js`。

## 我的设计与审核状态

左侧「我的设计」按当前选中的 `DeviceId` 查找每个本地表盘绑定的 `ClockId`，再向服务器 POST `Channel/GetDeviceClockInfo`（参数 `DeviceId`），从 `ClockList` 中匹配 `ClockId` 和 `Status`。一个本地设计在不同设备上的 ID 和线上状态互不串用。设备切换、刷新设备、上传成功后会重新查询；查询失败时显示「状态未知」，不会把旧结果当成当前状态。

| 服务器 `Status` | 左侧标签 | 含义 |
| --- | --- | --- |
| 无绑定 ID / 无线上记录 | 本地表盘 | 仅有当前设备的本地设计或设备表盘。 |
| `0` | 本地表盘 | 已上传但未公开；悬停标签可看到说明。 |
| `1` | 待用户回复 | 公开审核中，等待用户回复。 |
| `2` | 待管理员审核 | 公开审核中，等待管理员处理。 |
| `3` | 已上线 | 审核通过，其他用户可见。 |
| `4` | 审核未通过 | 可打开「审核记录」查看原因。 |

「审核记录」同时查询 `Channel/GetDeviceClockInfo` 的当前状态和 `Channel/GetUserClockReview`（`DeviceId`、`ClockId`）的 `ReviewList`；审核留言按 `IsUser` 区分管理员与用户。列表标签是简要概览，对话框保留服务器状态的完整描述。

## 顺序和协议

1. `Device/GetLanCapabilities` 检查 `SupportsClockShare: true`。
2. PC 将元素素材逐个 POST 到 `/upload_local_asset`，首段 JSON 为 `Device/UploadLocalAsset`，第二段为图片；以返回的 `local://...` 引用提交创建/修改配置。每个引用只绑定一次。真机不支持 tar/gzip 素材包。
3. 当前配置同步成功后，将显式选择的 APP 预览图转换成 WebP 并上传，通过 `Device/PatchLocalClockInfo` 的 `PreviewImage`（local 引用）和 `ClockName`（1–63 UTF-8 字节）保存。该过程沿用真机本地事务，失败保留旧文件和配置。
4. PC POST `/divoom_api`：`{"Command":"Device/ShareLocalClock","ClockId":123,"ShareToOthers":true,"ClassifyId":30,"MessageInfo":"本次更新说明"}`。`ShareToOthers=true` 时 `ClassifyId` 必填；首次上传的 `MessageInfo` 可为空，更新时 PC 强制填写。
5. 真机利用 SHA-256 内容摘要和 `/userdata/lan/shared/<sha256>.id` 上传记录跳过已成功上传的相同内容。替换文件会产生新摘要；部分失败后的重试会复用此前成功的上传。
6. 所有资源成功后，真机使用 `DIVOOM_NET_COMM_DEVICE_UPDATE_CLOCK_INFO`（`Channel/Upload_device_clock_info`）上传已替换为服务器 FileId 的配置，并附带数值 `Status`（公开待管理员审核为 `2`，不公开为 `0`）、`ClassifyId` 和 `MessageInfo`，等待服务器明确 `ReturnCode: 0`。本地配置的离线资源引用不被服务器引用覆盖。旧版固件若仍发送 `1`，界面会按服务器语义显示「待用户回复」，需升级真机固件。
7. 成功返回 `ReturnCode: 0, Shared: true, ClockId, Status, ClassifyId, MessageInfo, UploadedFiles, ReusedFiles, DeletedFiles`；文件失败或服务器未确认时返回失败，PC 不显示上传成功。

字体沿用固件现有字体 ID 和本地资源校验规则；该入口不创建新的云端字体 ID。

## 验证

- PC：`node scripts/test-watchface-upload.mjs`、`node scripts/test-watchface-share.mjs`、`node scripts/test-clock-review.mjs`、`npm run build`。
- 固件 Linux 主机构建环境：`python3 tools/test_lan_share.py`、`python3 tools/test_lan_local.py`。
- 真机验收：连接升级后的 AstroToo，创建包含底图和元素图的表盘并上传；确认服务器请求中的 `Status`、`ClassifyId`、`MessageInfo` 和资源 URL 正确。断网重试应显示失败；恢复网络重试应成功；相同文件复用上传记录，替换图片后应重新上传并删除不再引用的旧服务器文件。
