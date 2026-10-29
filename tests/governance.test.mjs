import test from 'node:test';
import assert from 'node:assert/strict';
import { GovernanceModel, PROFILES } from '../dist/governance.js';

const ids = documents => documents.map(document => document.id);
const doc = (model, id) => model.snapshot().documents.find(document => document.id === id);

test('initial observations separate pending/rejected review from present platform indexes', () => {
  const model = new GovernanceModel();
  assert.equal(model.snapshot().documents.length, 5);
  assert.equal(doc(model, 'doc-2').reviewState, 'pending');
  assert.equal(doc(model, 'doc-2').indexState, 'present');
  assert.equal(doc(model, 'doc-4').reviewState, 'rejected');
  assert.equal(doc(model, 'doc-4').indexState, 'present');
  assert.equal(doc(model, 'doc-5').enabled, false);
  assert.equal(doc(model, 'doc-5').indexState, 'removed');
  assert.equal(doc(model, 'doc-5').fileState, 'present');
});

test('ownership, approved+enabled visibility, and independent full-view permission produce distinct views', () => {
  const model = new GovernanceModel();
  assert.deepEqual(ids(model.snapshot().visibleDocuments), ['doc-1', 'doc-2', 'doc-3', 'doc-4']);
  model.setProfile('reader');
  assert.deepEqual(ids(model.snapshot().visibleDocuments), ['doc-1', 'doc-3']);
  model.setProfile('manager');
  assert.equal(model.snapshot().visibleDocuments.length, 5);
  assert.equal(model.snapshot().profile.canReview, false);
  model.setProfile('reviewer');
  assert.equal(model.snapshot().visibleDocuments.length, 5);
  assert.equal(model.snapshot().profile.canReview, true);
});

test('full-view manager cannot review; approval supersedes only local review state of same-title old version', () => {
  const model = new GovernanceModel();
  model.setProfile('manager');
  const before = model.snapshot().documents;
  assert.equal(model.review('doc-2', 'approved').ok, false);
  assert.deepEqual(model.snapshot().documents, before);
  model.setProfile('reviewer');
  const result = model.review('doc-2', 'approved');
  assert.equal(result.ok, true);
  assert.deepEqual(result.superseded, ['doc-1']);
  assert.equal(doc(model, 'doc-1').reviewState, 'superseded');
  assert.equal(doc(model, 'doc-1').enabled, true);
  assert.equal(doc(model, 'doc-1').indexState, 'present');
  assert.equal(doc(model, 'doc-1').fileState, 'present');
  assert.equal(doc(model, 'doc-2').reviewState, 'approved');
  assert.equal(doc(model, 'doc-2').indexState, 'present');
  model.setProfile('reader');
  assert.deepEqual(ids(model.snapshot().visibleDocuments), ['doc-2', 'doc-3']);
});

test('reject requires a reason and leaves pre-existing approved version and all index observations intact', () => {
  const model = new GovernanceModel();
  model.setProfile('reviewer');
  const before = model.snapshot().documents;
  assert.equal(model.review('doc-2', 'rejected', '  ').ok, false);
  assert.deepEqual(model.snapshot().documents, before);
  assert.equal(model.review('doc-2', 'rejected', '  请补充来源  ').ok, true);
  assert.equal(doc(model, 'doc-2').reviewComment, '请补充来源');
  assert.equal(doc(model, 'doc-2').reviewState, 'rejected');
  assert.equal(doc(model, 'doc-2').indexState, 'present');
  assert.equal(doc(model, 'doc-1').reviewState, 'approved');
  assert.equal(model.review('doc-2', 'approved').ok, false);
});

test('access explanation is pure and does not treat disabled approved records as an absolute original-read denial', () => {
  const model = new GovernanceModel();
  model.setProfile('reader');
  const before = model.snapshot();
  const disabled = model.explainAccess('doc-5');
  assert.equal(disabled.visible, false);
  assert.equal(disabled.canPreview, true);
  assert.match(disabled.message, /不代表平台检索门禁/);
  assert.equal(model.explainAccess('doc-2').canPreview, false);
  assert.deepEqual(model.snapshot(), before);
  model.setProfile('contributor');
  assert.equal(model.explainAccess('doc-2').canPreview, true);
  assert.equal(model.explainAccess('missing').ok, false);
});

test('submission requires its own capability and produces a pending, already-indexed synthetic record', () => {
  const model = new GovernanceModel();
  model.setProfile('reader');
  assert.equal(model.submit().ok, false);
  assert.equal(model.snapshot().documents.length, 5);
  model.setProfile('reviewer');
  assert.equal(model.submit().ok, false);
  model.setProfile('contributor');
  const result = model.submit();
  assert.equal(result.ok, true);
  const submitted = doc(model, result.docId);
  assert.equal(submitted.ownerId, 'lin');
  assert.equal(submitted.reviewState, 'pending');
  assert.equal(submitted.indexState, 'present');
  assert.equal(submitted.fileState, 'present');
  model.setProfile('manager');
  const second = model.submit();
  assert.equal(doc(model, second.docId).ownerId, 'mei');
  assert.notEqual(doc(model, second.docId).title, submitted.title);
});

test('precheck checks every identity before any operation; a permission denial leaves every document untouched', () => {
  const model = new GovernanceModel();
  const before = model.snapshot().documents;
  const denied = model.batchDelete(['doc-1', 'doc-3'], { failAt: 1 });
  assert.equal(denied.ok, false);
  assert.equal(denied.phase, 'precheck');
  assert.equal(denied.completed, 0);
  assert.equal(denied.reason, 'permission');
  assert.deepEqual(model.snapshot().documents, before);
  const missing = model.batchDelete(['doc-3', 'missing']);
  assert.equal(missing.reason, 'missing');
  assert.deepEqual(model.snapshot().documents, before);
});

test('successful batch deduplicates input and retains tombstones for observable cleanup', () => {
  const model = new GovernanceModel();
  model.setProfile('manager');
  const result = model.batchDelete(['doc-1', 'doc-1', 'doc-3']);
  assert.equal(result.phase, 'complete');
  assert.equal(result.completed, 2);
  assert.equal(result.total, 2);
  for (const id of ['doc-1', 'doc-3']) {
    assert.equal(doc(model, id).deleted, true);
    assert.equal(doc(model, id).indexState, 'removed');
    assert.equal(doc(model, id).fileState, 'removed');
    assert.equal(doc(model, id).syncState, 'synced');
  }
  assert.equal(model.snapshot().documents.length, 5);
  assert.deepEqual(ids(model.snapshot().visibleDocuments), ['doc-2', 'doc-4', 'doc-5']);
});

test('execution failure keeps completed work, marks failed platform state unknown, and leaves later items untouched', () => {
  const model = new GovernanceModel();
  model.setProfile('manager');
  const untouched = doc(model, 'doc-3');
  const result = model.batchDelete(['doc-1', 'doc-2', 'doc-3'], { failAt: 2 });
  assert.equal(result.ok, false);
  assert.equal(result.phase, 'execution');
  assert.equal(result.completed, 1);
  assert.equal(result.total, 3);
  assert.equal(result.failedId, 'doc-2');
  assert.equal(doc(model, 'doc-1').deleted, true);
  assert.equal(doc(model, 'doc-1').indexState, 'removed');
  assert.equal(doc(model, 'doc-2').deleted, false);
  assert.equal(doc(model, 'doc-2').indexState, 'unknown');
  assert.equal(doc(model, 'doc-2').fileState, 'unknown');
  assert.equal(doc(model, 'doc-2').syncState, 'unknown');
  assert.deepEqual(doc(model, 'doc-3'), untouched);
  assert.match(result.message, /没有自动补偿或回滚/);
});

test('first-item failure differs from precheck rejection and a successful targeted retry resolves uncertainty', () => {
  const model = new GovernanceModel();
  model.setProfile('manager');
  const later = doc(model, 'doc-3');
  const result = model.batchDelete(['doc-2', 'doc-3'], { failAt: 1 });
  assert.equal(result.completed, 0);
  assert.equal(result.phase, 'execution');
  assert.equal(doc(model, 'doc-2').indexState, 'unknown');
  assert.deepEqual(doc(model, 'doc-3'), later);
  assert.equal(model.batchDelete(['doc-2']).ok, true);
  assert.equal(doc(model, 'doc-2').syncState, 'synced');
  assert.equal(doc(model, 'doc-2').indexState, 'removed');
});

test('invalid actions do not mutate documents and snapshots or returned results cannot mutate model internals', () => {
  const model = new GovernanceModel();
  const initial = model.snapshot().documents;
  assert.equal(model.batchDelete([]).phase, 'precheck');
  assert.equal(model.batchDelete([{}]).reason, 'missing');
  assert.equal(model.batchDelete([null]).reason, 'missing');
  assert.equal(model.batchDelete(['doc-1'], { failAt: -1 }).ok, false);
  assert.equal(model.setProfile('unknown-profile').ok, false);
  assert.deepEqual(model.snapshot().documents, initial);
  const result = model.submit();
  const snapshot = model.snapshot();
  snapshot.documents[0].reviewState = 'tampered';
  snapshot.visibleDocuments[0].title = 'tampered';
  snapshot.profiles[0].seeAll = true;
  snapshot.events[0].message = 'tampered';
  snapshot.lastResult.message = 'tampered';
  result.message = 'tampered';
  assert.equal(doc(model, 'doc-1').reviewState, 'approved');
  assert.equal(doc(model, 'doc-1').title, '巡检手册');
  assert.equal(model.snapshot().profile.seeAll, false);
  assert.notEqual(model.snapshot().events[0].message, 'tampered');
  assert.notEqual(model.snapshot().lastResult.message, 'tampered');
  assert.ok(Object.isFrozen(PROFILES) && PROFILES.every(Object.isFrozen));
});

test('audit history is bounded, event identities increase, and reset restores deterministic documents', () => {
  const model = new GovernanceModel();
  for (let i = 0; i < 40; i++) model.setProfile(i % 2 ? 'reader' : 'manager');
  const events = model.snapshot().events;
  assert.equal(events.length, 30);
  assert.ok(events.every((event, i) => i === 0 || event.id > events[i - 1].id));
  const last = events.at(-1).id;
  model.reset();
  assert.equal(model.snapshot().profile.id, 'contributor');
  assert.equal(model.snapshot().events.length, 1);
  assert.ok(model.snapshot().events[0].id > last);
  assert.deepEqual(ids(model.snapshot().documents), ['doc-1', 'doc-2', 'doc-3', 'doc-4', 'doc-5']);
});
