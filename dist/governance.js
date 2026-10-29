// Independent, browser-local teaching model. All identities and documents are synthetic.
// Review visibility and observed platform state are separate dimensions throughout.
const copy = value => JSON.parse(JSON.stringify(value));
const freeze = value => {
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object' && !Object.isFrozen(child)) freeze(child);
  }
  return value;
};

export const PROFILES = freeze([
  { id: 'contributor', label: '上传者 · 林工', userId: 'lin', department: '运行一组', seeAll: false, canReview: false, operate: 'own', canSubmit: true },
  { id: 'reader', label: '普通使用者 · 陈工', userId: 'chen', department: '运行二组', seeAll: false, canReview: false, operate: 'none', canSubmit: false },
  { id: 'manager', label: '全览管理员 · 梅工', userId: 'mei', department: '资料管理组', seeAll: true, canReview: false, operate: 'all', canSubmit: true },
  { id: 'reviewer', label: '审核员 · 许工', userId: 'xu', department: '资料管理组', seeAll: true, canReview: true, operate: 'all', canSubmit: false }
]);

const INITIAL_DOCUMENTS = freeze([
  { id: 'doc-1', title: '巡检手册', version: 1, ownerId: 'lin', ownerLabel: '林工', reviewState: 'approved', enabled: true, deleted: false, indexState: 'present', fileState: 'present', syncState: 'synced', reviewComment: '' },
  { id: 'doc-2', title: '巡检手册', version: 2, ownerId: 'lin', ownerLabel: '林工', reviewState: 'pending', enabled: true, deleted: false, indexState: 'present', fileState: 'present', syncState: 'synced', reviewComment: '' },
  { id: 'doc-3', title: '观测说明', version: 1, ownerId: 'zhou', ownerLabel: '周工', reviewState: 'approved', enabled: true, deleted: false, indexState: 'present', fileState: 'present', syncState: 'synced', reviewComment: '' },
  { id: 'doc-4', title: '演练清单', version: 1, ownerId: 'lin', ownerLabel: '林工', reviewState: 'rejected', enabled: true, deleted: false, indexState: 'present', fileState: 'present', syncState: 'synced', reviewComment: '请补充演练记录。' },
  { id: 'doc-5', title: '归档指引', version: 1, ownerId: 'zhou', ownerLabel: '周工', reviewState: 'approved', enabled: false, deleted: false, indexState: 'removed', fileState: 'present', syncState: 'synced', reviewComment: '' }
]);

export class GovernanceModel {
  #profileId = 'contributor';
  #documents = [];
  #events = [];
  #lastResult = null;
  #nextDocument = 6;
  #eventSequence = 0;

  constructor() { this.reset(); }

  #profile() { return PROFILES.find(profile => profile.id === this.#profileId); }

  #event(type, message) {
    this.#events.push({ id: ++this.#eventSequence, type, message });
    if (this.#events.length > 30) this.#events.splice(0, this.#events.length - 30);
  }

  #result(result, eventType = null) {
    this.#lastResult = copy(result);
    if (eventType) this.#event(eventType, result.message);
    return copy(result);
  }

  #visible(document) {
    const profile = this.#profile();
    return !document.deleted && (profile.seeAll || document.ownerId === profile.userId || (document.reviewState === 'approved' && document.enabled));
  }

  #canOperate(document) {
    const profile = this.#profile();
    return profile.operate === 'all' || (profile.operate === 'own' && document.ownerId === profile.userId);
  }

  reset() {
    this.#profileId = 'contributor';
    this.#documents = copy(INITIAL_DOCUMENTS);
    this.#events = [];
    this.#nextDocument = 6;
    return this.#result({ ok: true, message: '已恢复合成资料和上传者视角。审核状态与索引状态分别观测。' }, 'reset');
  }

  setProfile(id) {
    const profile = PROFILES.find(item => item.id === id);
    if (!profile) return this.#result({ ok: false, message: '未找到这个演示身份。' }, 'profile-denied');
    this.#profileId = profile.id;
    return this.#result({ ok: true, message: '已切换到' + profile.label + '；全览、审核和操作权限独立设置。', profileId: profile.id }, 'profile-changed');
  }

  snapshot() {
    return copy({
      profile: this.#profile(), profiles: PROFILES,
      documents: this.#documents,
      visibleDocuments: this.#documents.filter(document => this.#visible(document)),
      events: this.#events, lastResult: this.#lastResult
    });
  }

  submit() {
    const profile = this.#profile();
    if (!profile.canSubmit) return this.#result({ ok: false, message: '当前演示身份没有提交权限；全览或审核能力不会自动授予提交权限。' }, 'submit-denied');
    const number = this.#nextDocument++;
    const document = {
      id: 'doc-' + number, title: number === 6 ? '值班补充说明' : '值班补充说明 · ' + (number - 5),
      version: 1, ownerId: profile.userId, ownerLabel: profile.label.split(' · ').at(-1),
      reviewState: 'pending', enabled: true, deleted: false,
      indexState: 'present', fileState: 'present', syncState: 'synced', reviewComment: ''
    };
    this.#documents.push(document);
    return this.#result({ ok: true, docId: document.id, message: '已提交“' + document.title + '”：本地待审核，合成平台索引已存在。审核不自动充当检索闸门。' }, 'submitted');
  }

  review(docId, verdict, reason = '') {
    if (!this.#profile().canReview) return this.#result({ ok: false, message: '当前身份没有审核权限；能全览资料不代表能批准或驳回。' }, 'review-denied');
    if (!['approved', 'rejected'].includes(verdict)) return this.#result({ ok: false, message: '请选择批准或驳回。' }, 'review-denied');
    const document = this.#documents.find(item => item.id === docId && !item.deleted);
    if (!document) return this.#result({ ok: false, message: '条目不存在或已删除。' }, 'review-denied');
    if (document.reviewState !== 'pending') return this.#result({ ok: false, message: '只有待审核条目可以执行本次审核。' }, 'review-denied');
    const comment = typeof reason === 'string' ? reason.trim() : '';
    if (verdict === 'rejected' && !comment) return this.#result({ ok: false, message: '驳回理由不能为空。' }, 'review-denied');
    const superseded = [];
    if (verdict === 'approved') {
      for (const old of this.#documents) {
        if (!old.deleted && old.id !== document.id && old.title === document.title && old.reviewState === 'approved') {
          old.reviewState = 'superseded';
          superseded.push(old.id);
        }
      }
    }
    document.reviewState = verdict;
    document.reviewComment = verdict === 'rejected' ? comment : '';
    const action = verdict === 'approved' ? '批准' : '驳回';
    const message = '已' + action + '“' + document.title + ' v' + document.version + '”。'
      + (superseded.length ? '同名旧批准版本已在本地标记为失效。' : '')
      + '本次只改变本地审核状态，索引和文件观测状态不变。';
    return this.#result({ ok: true, docId, verdict, superseded, message }, 'reviewed');
  }

  explainAccess(docId) {
    const document = this.#documents.find(item => item.id === docId);
    if (!document || document.deleted) return {
      ok: false, docId, visible: false, canPreview: false, checks: [],
      message: '条目不存在或已删除；已删除记录只保留用于平台状态观测。'
    };
    const profile = this.#profile();
    const isOwner = document.ownerId === profile.userId;
    const approved = document.reviewState === 'approved';
    const visible = this.#visible(document);
    const canPreview = approved || isOwner || profile.seeAll;
    return copy({
      ok: true, docId, visible, canPreview, isOwner, seeAll: profile.seeAll,
      approved, enabled: document.enabled, indexState: document.indexState,
      checks: [
        { label: '本人上传', passed: isOwner },
        { label: '拥有全览能力', passed: profile.seeAll },
        { label: '审核已通过', passed: approved },
        { label: '条目已启用', passed: document.enabled }
      ],
      message: '本地列表：' + (visible ? '可见' : '不可见') + '；本地审核访问条件：' + (canPreview ? '允许' : '拒绝')
        + '。启用状态参与普通列表筛选，不单独决定原文一定可达。此解释不代表平台检索门禁，索引状态需独立观测。'
    });
  }

  batchDelete(ids, { failAt = 0 } = {}) {
    const uniqueIds = Array.isArray(ids) ? [...new Set(ids)] : [];
    const total = uniqueIds.length;
    const deny = (message, reason, blockedId = null) => this.#result({
      ok: false, phase: 'precheck', completed: 0, total, message, reason, blockedId
    }, 'precheck-denied');
    if (!Array.isArray(ids) || !total) return deny('请先选择需要操作的条目。', 'empty');
    if (uniqueIds.some(id => typeof id !== 'string' || !id.trim())) return deny('选中的条目标识无效；整批停止，尚未执行任何删除。', 'missing');
    if (!Number.isInteger(failAt) || failAt < 0) return deny('教学故障位置必须为非负整数；0 表示不注入故障。', 'invalid-failure-position');
    const documents = [];
    // Resolve every item before checking operation rights: no partial mutation during precheck.
    for (const id of uniqueIds) {
      const document = this.#documents.find(item => item.id === id && !item.deleted);
      if (!document) return deny('选中包含不存在或已删除的条目；整批停止，尚未执行任何删除。', 'missing', id);
      documents.push(document);
    }
    for (const document of documents) {
      if (!this.#canOperate(document)) return deny('选中包含当前身份不可操作的条目；整批预检拒绝，没有改变任何资料状态。', 'permission', document.id);
    }
    this.#event('precheck-passed', '全部 ' + total + ' 个条目通过存在性与操作权限预检，开始逐项执行。');
    let completed = 0;
    for (let index = 0; index < documents.length; index++) {
      const document = documents[index];
      if (failAt === index + 1) {
        document.indexState = 'unknown';
        document.fileState = 'unknown';
        document.syncState = 'unknown';
        return this.#result({
          ok: false, phase: 'execution', completed, total, failedId: document.id,
          message: '教学故障注入：已完成 ' + completed + '/' + total + ' 项，第 ' + (index + 1)
            + ' 项平台结果未知；后续条目未处理。请核对实际状态后再决定下一步，本演示没有自动补偿或回滚已完成项。'
        }, 'execution-interrupted');
      }
      document.deleted = true;
      document.enabled = false;
      document.indexState = 'removed';
      document.fileState = 'removed';
      document.syncState = 'synced';
      completed++;
      this.#event('item-deleted', '已完成删除“' + document.title + ' v' + document.version + '”，索引与文件观测为已移除。');
    }
    return this.#result({ ok: true, phase: 'complete', completed, total,
      message: '已完成 ' + completed + '/' + total + ' 项删除。已删除资料不再出现在本地可见列表，平台观测记录继续保留。'
    }, 'execution-complete');
  }
}
