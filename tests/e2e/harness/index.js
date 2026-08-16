'use strict';

const { AuthEmulator } = require('./authEmulator');
const { FirestoreMock } = require('./firestoreMock');
const { DomInspector } = require('./domInspector');
const {
  EXPECTED_TOPIC_SLUGS,
  createTestPaper,
  createSampleDailyFeed,
  validatePaperStructure
} = require('./testFramework');

module.exports = {
  AuthEmulator,
  FirestoreMock,
  DomInspector,
  EXPECTED_TOPIC_SLUGS,
  createTestPaper,
  createSampleDailyFeed,
  validatePaperStructure
};
