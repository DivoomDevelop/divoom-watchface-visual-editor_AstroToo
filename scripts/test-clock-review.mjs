import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createDivoomChinaStoreJson } from "../src/editor/divoomCloudApi.js";

const originalFetch = globalThis.fetch;
let requestedUrl = "";
let requestedBody;
try {
  globalThis.fetch = async (url, options) => {
    requestedUrl = String(url);
    requestedBody = JSON.parse(options.body);
    assert.equal(options.method, "POST");
    return {
      ok: true,
      text: async () => JSON.stringify(requestedBody.Command === "Channel/GetDeviceClockInfo"
        ? { ReturnCode: 0, ClockList: [{ ClockId: 60003, Status: 3 }] }
        : { ReturnCode: 0, ReviewList: [{ IsUser: 0, ReviewDesc: "审核通过", UpdateTime: 1790152140 }] })
    };
  };
  const storeJson = createDivoomChinaStoreJson(() => 300426474);
  const result = await storeJson("Channel/GetUserClockReview", { DeviceId: 300426474, ClockId: 60003 });
  assert.equal(requestedUrl, "/divoom-china-review-api/Channel/GetUserClockReview");
  assert.equal(requestedBody.Command, "Channel/GetUserClockReview");
  assert.equal(requestedBody.DeviceId, 300426474);
  assert.equal(requestedBody.ClockId, 60003);
  assert.equal(result.ReviewList[0].ReviewDesc, "审核通过");
  const clockInfo = await storeJson("Channel/GetDeviceClockInfo", { DeviceId: 300426474 });
  assert.equal(requestedUrl, "/divoom-china-review-api/Channel/GetDeviceClockInfo");
  assert.equal(requestedBody.Command, "Channel/GetDeviceClockInfo");
  assert.equal(requestedBody.DeviceId, 300426474);
  assert.equal(requestedBody.ClockId, undefined);
  assert.equal(clockInfo.ClockList[0].Status, 3);
} finally {
  globalThis.fetch = originalFetch;
}

const source = fs.readFileSync(new URL("../src/editor/app.js", import.meta.url), "utf8");
const start = source.indexOf("  function formatLanReviewTime(");
const end = source.indexOf("  function refreshLanActionButtons()", start);
assert(start >= 0 && end > start);
const element = () => ({ textContent: "", disabled: false, hidden: false });
const list = { children: [], replaceChildren() { this.children = []; }, appendChild(row) { this.children.push(row); } };
const dom = {
  lanReviewTitle: element(), lanReviewContext: element(), lanReviewStatusLabel: element(),
  lanReviewStatus: element(), lanReviewStatusNote: element(), lanReviewListTitle: element(),
  lanReviewList: list, lanReviewEmpty: element(), lanReviewRefresh: element(), lanReviewClose: element()
};
let response = { ReturnCode: 0, ReviewList: [
  { IsUser: 1, ReviewDesc: "提交审核", UpdateTime: 1790152000 },
  { IsUser: 0, ReviewDesc: "审核通过", UpdateTime: 1790152140 }
] };
let statusResponse = { ReturnCode: 0, ClockList: [
  { ClockId: 60004, Status: 4 },
  { ClockId: 60003, Status: 3 }
] };
const context = vm.createContext({
  Number, Date, String, Array,
  dom,
  document: { createElement: () => ({ textContent: "", append(...children) { this.children = children; } }) },
  lanReviewRequestToken: 0,
  localWatchClockStatusByDevice: new Map(),
  localWatchStatusRequestSeq: 0,
  refreshLocalWatchfaceListUi: () => {},
  lanReviewView: {
    phase: "idle", deviceId: 0, clockId: 0, records: [], error: "",
    statusPhase: "idle", statusCode: null, statusError: ""
  },
  resolveClockBindingDeviceId: () => 300426474,
  state: { config: { ClockId: 60003 } },
  toNum: (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback,
  getLocaleCode: () => "zh-CN",
  setNodeText: (node, value) => { node.textContent = String(value); },
  t: (key, vars = {}) => `${key}${Object.keys(vars).length ? `:${JSON.stringify(vars)}` : ""}`,
  errorToText: (error) => error.message,
  divoomStoreJson: async (command, payload) => {
    assert.equal(payload.DeviceId, 300426474);
    if (command === "Channel/GetDeviceClockInfo") {
      assert.equal(payload.ClockId, undefined);
      if (statusResponse instanceof Error) throw statusResponse;
      return statusResponse;
    }
    assert.equal(command, "Channel/GetUserClockReview");
    assert.equal(payload.ClockId, 60003);
    if (response instanceof Error) throw response;
    return response;
  }
});
vm.runInContext(source.slice(start, end), context);
await context.loadLanReviewHistory();
assert.equal(dom.lanReviewStatus.textContent, "lan.review.clockStatus.approved");
assert.equal(context.localWatchfaceStatus(300426474, 60003).key, "approved");
assert.equal(context.localWatchfaceStatus(300426474, 60004).key, "rejected");
assert.equal(context.localWatchfaceStatus(300426475, 60003).key, "loading");
assert.equal(context.localWatchfaceStatus(300426474, 0).key, "local");
assert.equal(dom.lanReviewStatusNote.textContent, "lan.review.statusSource");
assert.equal(list.children.length, 2);
assert.equal(list.children[0].children[0].textContent, "lan.review.actorAdmin");
assert.equal(list.children[0].className, "lan-review-entry--admin");
assert.match(list.children[0].children[1].textContent, /审核通过/);
assert.match(list.children[0].children[1].textContent, /2026/);
assert.equal(list.children[1].children[0].textContent, "lan.review.actorUser");
assert.equal(list.children[1].className, "lan-review-entry--user");
assert.match(list.children[1].children[1].textContent, /提交审核/);

for (const [status, key] of [
  [0, "private"], [1, "waitingUser"], [2, "waitingAdmin"],
  [3, "approved"], [4, "rejected"]
]) {
  statusResponse.ClockList[1].Status = status;
  await context.loadLanReviewHistory();
  assert.equal(dom.lanReviewStatus.textContent, `lan.review.clockStatus.${key}`);
  assert.equal(context.localWatchfaceStatus(300426474, 60003).key, key);
  assert.equal(dom.lanReviewStatus.className, status === 3 ? "lan-review-status--approved"
    : status === 4 ? "lan-review-status--rejected"
    : status === 1 || status === 2 ? "lan-review-status--pending" : "");
}

response = { ReturnCode: 0, ReviewList: [{ ReviewDesc: "旧记录", UpdateTime: 1790152100 }] };
await context.loadLanReviewHistory();
assert.equal(list.children[0].children[0].textContent, "lan.review.actorUnknown");

response = { ReturnCode: 0, ReviewList: [] };
await context.loadLanReviewHistory();
assert.equal(dom.lanReviewStatus.textContent, "lan.review.clockStatus.rejected");
assert.equal(dom.lanReviewEmpty.hidden, false);

response = { ReturnCode: 0 };
await context.loadLanReviewHistory();
assert.equal(dom.lanReviewStatus.textContent, "lan.review.clockStatus.rejected");
assert.match(dom.lanReviewEmpty.textContent, /lan.review.invalidResponse/);

response = { ReturnCode: 0, ReviewList: [] };
statusResponse = { ReturnCode: 0, ClockList: [{ ClockId: 60004, Status: 3 }] };
await context.loadLanReviewHistory();
assert.equal(dom.lanReviewStatus.textContent, "lan.review.statusNotListed");
assert.equal(context.localWatchfaceStatus(300426474, 60003).key, "local");

statusResponse = new Error("status offline");
await context.loadLanReviewHistory();
assert.equal(dom.lanReviewStatus.textContent, "lan.review.statusLoadFailed");
assert.equal(dom.lanReviewStatusNote.textContent, "status offline");
assert.equal(dom.lanReviewEmpty.textContent, "lan.review.recordsEmpty");

statusResponse = { ReturnCode: 0, ClockList: [{ ClockId: 60003, Status: 2 }] };
await context.refreshLocalWatchfaceStatusForDevice({ force: true });
assert.equal(context.localWatchfaceStatus(300426474, 60003).key, "waitingAdmin");
statusResponse = new Error("status offline");
await context.refreshLocalWatchfaceStatusForDevice({ force: true });
assert.equal(context.localWatchfaceStatus(300426474, 60003).key, "unknown");

console.log("PASS: live-status route, all five statuses, matching ClockId, independent errors and review roles");
