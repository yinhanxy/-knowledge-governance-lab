# Knowledge Governance Lab

独立知识治理教学模型：审核、列表可见、操作能力与平台资源状态分别观察。使用虚构人物和五份合成文件，无外部服务或第三方依赖。

[在线操作案例](http://120.27.247.229/?v=1&demo=governance&scene=visibility#governance) · [状态模型](dist/governance.js) · [行为测试](tests/governance.test.mjs)

## 运行

安装 Node.js 20 或更新版本，在仓库根目录运行：

```text
npm test
```

不需要 `npm install`、Java、浏览器或 API Key。测试只使用 Node 内建的 `node:test` 和 `node:assert/strict`。

## 三条阅读路线

| 页面现象 | 模型入口 | 测试依据 |
| --- | --- | --- |
| 普通使用者只看已批准且启用资料；上传者看本人记录；全览能力不等于审核能力 | `PROFILES`、`setProfile`、`snapshot`、`review` | `ownership, approved+enabled visibility...`、`full-view manager cannot review...` |
| 批准 v2 后，v1 本地被替代，平台索引仍独立保留 | `review`、`snapshot` | `full-view manager cannot review; approval supersedes only...` |
| 全体预检拒绝完成 0 项；执行中第二项失败保留第一项，失败项平台结果待核对 | `batchDelete` | 名称含 `precheck`、`partial`、`retry` 的行为用例 |

可先在在线页面切换身份，再批准新版，最后比较两种失败；回到测试文件核对每个断言所用的合成数据和条件。12 项测试的当次通过情况以本机执行结果为准。

```js
import { GovernanceModel } from './dist/governance.js';

const model = new GovernanceModel();
model.setProfile('manager');
const result = model.batchDelete(['doc-1', 'doc-3'], { failAt: 2 });
console.log(result); // completed: 1，失败项平台状态 unknown
```

## 实现与验证边界

- 这是浏览器教学页面使用的独立 JS 状态模型，未调用线上 Java API、真实鉴权服务、对象存储或内部系统。
- `snapshot()` 为教学观察返回合成状态，`explainAccess()` 解释条件，不读取原文；它们不是生产安全边界。
- 审核变化不能证明平台检索统一过滤。执行失败和定向重试测试不能证明生产存在自动补偿、分布式事务或端到端恢复保证。
- 测试证明本模型在指定合成条件下的行为，不能替代生产鉴权、资源一致性或性能验证。
- 页面中的个人实践依据单独说明。本仓库公开合成教学实现，不包含内部源码或原始工作记录。

## 与网站版本对应

本次模型取自作品站模型版本 `9829b63`，本仓库 `dist/governance.js` 与发布网站的同名文件逐字节一致。模型内容指纹：`f7c550853bfa39984770d64752d7fac6ad558c8c219340391c72c8e7195e7d1f`。

模型更新时，先运行行为测试，再同步网站副本并核对 SHA256；随后更新本段版本与指纹。界面适配器和引导会话管理属于网站工程，不包含在本仓库模型中。

## License

MIT，见 [LICENSE](LICENSE)。
