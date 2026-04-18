import { __test__notesProxy } from '../routes/notesProxy';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function run(): void {
  // mapped user with templates
  const mappedTemplates = __test__notesProxy.normalizeTemplatesPayload({
    triage_note: { name: 'Triage Note', type: 'custom' },
    op_note: { label: 'Operative Note' },
  });
  const mappedResponse = __test__notesProxy.createTemplatesResponse(mappedTemplates, false);
  assert(mappedResponse.templates.length === 2, 'Expected templates for mapped user.');
  assert(mappedResponse.empty === false, 'Expected non-empty templates state for mapped user.');
  assert(mappedResponse.needsHaloSetup === false, 'Expected no setup requirement for mapped user.');

  // mapped user with zero templates
  const emptyMappedResponse = __test__notesProxy.createTemplatesResponse([], false);
  assert(emptyMappedResponse.templates.length === 0, 'Expected empty templates list for mapped user with no templates.');
  assert(emptyMappedResponse.empty === true, 'Expected empty=true for mapped user with no templates.');
  assert(emptyMappedResponse.needsHaloSetup === false, 'Expected needsHaloSetup=false for mapped user with no templates.');

  // unmapped user
  const unmappedResponse = __test__notesProxy.createTemplatesResponse([], true);
  assert(unmappedResponse.empty === true, 'Expected empty=true for unmapped user setup response.');
  assert(unmappedResponse.needsHaloSetup === true, 'Expected needsHaloSetup=true for unmapped user setup response.');

  // invalid template_id validation
  const invalidTemplate = __test__notesProxy.validateGenerateNoteBody({ text: 'hello', return_type: 'note' });
  assert(invalidTemplate.ok === false, 'Expected missing template_id to be invalid.');

  const invalidReturnType = __test__notesProxy.validateGenerateNoteBody({
    template_id: 'abc',
    text: 'hello',
    return_type: 'pdf',
  });
  assert(invalidReturnType.ok === false, 'Expected unsupported return_type to be invalid.');

  const clientUserIdIsIgnored = __test__notesProxy.validateGenerateNoteBody({
    user_id: 'google-oauth-id-should-be-ignored',
    template_id: 'abc',
    text: 'hello',
    return_type: 'note',
  });
  assert(clientUserIdIsIgnored.ok === true, 'Expected client user_id to be ignored by request validation.');

  // generate_note note response classification
  assert(
    __test__notesProxy.shouldTreatAsDocxResponse('note', 'application/json') === false,
    'Expected note mode JSON response not to be treated as DOCX.'
  );

  // generate_note docx response classification
  assert(
    __test__notesProxy.shouldTreatAsDocxResponse(
      'docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) === true,
    'Expected docx mode wordprocessing content-type to be treated as DOCX.'
  );

  // HALO invalid template rejection mapping
  assert(
    __test__notesProxy.mapGenerateNoteUpstreamStatus(404) === 400,
    'Expected upstream 404 (invalid template/user) to map to app 400.'
  );

  console.log('notes-proxy-contract tests passed');
}

run();
