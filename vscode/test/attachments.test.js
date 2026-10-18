'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareAttachment, questionWithAttachments, checkAttachmentSet, imageInfo } = require('../lib/attachments');
const { ACTIONS, slashAction, fileReference } = require('../lib/actions');
const manifest = require('../package.json');

function pngHeader(width, height) {
  const data = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(data);
  data.write('IHDR', 12); data.writeUInt32BE(width, 16); data.writeUInt32BE(height, 20);
  return data;
}

test('image attachment uses bounded local OCR and never sends base64 in model context', async () => {
  const bytes = pngHeader(640, 480);
  let called = 0;
  const attachment = await prepareAttachment('screen.png', bytes, { ocr: async (input) => { assert.deepEqual(input, bytes); called++; return 'Error: connection refused'; } });
  assert.equal(called, 1);
  assert.equal(attachment.kind, 'image');
  assert.ok(attachment.preview.startsWith('data:image/png;base64,'));
  const context = questionWithAttachments('Explain this error', [attachment]);
  assert.match(context, /Error: connection refused/);
  assert.match(context, /the image itself was not seen/);
  assert.ok(!context.includes(attachment.preview));
});

test('large image dimensions, empty OCR and credential text are refused before a task', async () => {
  let called = false;
  await assert.rejects(prepareAttachment('huge.png', pngHeader(10000, 10000), { ocr: async () => { called = true; return 'x'; } }), { code: 'image_dimensions' });
  assert.equal(called, false);
  await assert.rejects(prepareAttachment('empty.png', pngHeader(2, 2), { ocr: async () => '' }), { code: 'image_no_text' });
  await assert.rejects(prepareAttachment('secret.png', pngHeader(2, 2), { ocr: async () => 'api_key=example-secret-value' }), { code: 'attachment_refused' });
  await assert.rejects(prepareAttachment('.env', Buffer.from('SAFE=still-not-allowed')), { code: 'attachment_refused' });
});

test('text attachments reject binary content and escape their data fence', async () => {
  await assert.rejects(prepareAttachment('file.bin', Buffer.from([0, 1, 2])), { code: 'attachment_refused' });
  await assert.rejects(prepareAttachment('fake.jpg', Buffer.from('not a JPEG')), { code: 'image_format' });
  const attachment = await prepareAttachment('example.js', Buffer.from('~~~~\nquoted data'));
  const context = questionWithAttachments('Review', [attachment]);
  assert.match(context, /\n~~~~~\n~~~~\nquoted data\n~~~~~/);
  assert.throws(() => checkAttachmentSet(Array.from({ length: 5 }, () => attachment)), { code: 'attachment_count' });
  assert.equal(imageInfo(Buffer.from('short')), null);
});

test('slash commands are explicit, bounded and declared in the manifest', () => {
  assert.equal(slashAction('Explain this code'), null);
  assert.deepEqual(slashAction('/attach "folder/screen shot.png"'), { command: 'tvijo.attachFile', argument: '"folder/screen shot.png"' });
  assert.equal(slashAction('/unknown').command, null);
  const declared = new Set(manifest.contributes.commands.map((item) => item.command));
  for (const [id] of ACTIONS) assert.ok(declared.has(id), id);
  assert.equal(fileReference('/workspace/design/screen shot.jpg'), '/workspace/design/screen shot.jpg');
  assert.equal(fileReference('[screenshot](</workspace/screen shot.png>)'), '/workspace/screen shot.png');
  assert.equal(fileReference('file:///workspace/screen%20shot.png'), '/workspace/screen shot.png');
  assert.equal(fileReference('https://example.com/image.png'), null);
  assert.equal(fileReference('Explain src/example.js'), null);
  assert.equal(fileReference('/status'), null);
  assert.equal(fileReference('/attach src/example.js'), null);
});
