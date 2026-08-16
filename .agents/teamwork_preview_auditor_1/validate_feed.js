'use strict';

const fs = require('fs');
const path = require('path');

const feedPath = path.resolve(__dirname, '../../app/src/data/dailyFeed.json');
const feed = JSON.parse(fs.readFileSync(feedPath, 'utf8'));

const expectedTopics = ['ml', 'dl', 'nlp', 'cv', 'ai-health', 'llm', 'robotics', 'cybersecurity', 'data-science', 'bio'];
console.log('Generated At:', feed.generatedAt);
console.log('Topics Count:', Object.keys(feed.topics).length);

let total = 0;
let errors = 0;

expectedTopics.forEach(t => {
  const papers = feed.topics[t] || [];
  total += papers.length;
  console.log(`- Topic: ${t.padEnd(16)} | Papers: ${papers.length}`);
  
  if (papers.length === 0) {
    console.error(`  ERROR: Topic ${t} is empty!`);
    errors++;
  }

  papers.forEach((p, idx) => {
    if (!p.id || !p.originalTitle || !p.summary || !p.url) {
      console.error(`  ERROR: Invalid paper in ${t}[${idx}]:`, p);
      errors++;
    }
  });
});

console.log(`\nTotal Papers: ${total} | Validation Errors: ${errors}`);
process.exit(errors > 0 ? 1 : 0);
