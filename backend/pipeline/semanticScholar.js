'use strict';

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch a TLDR summary from Semantic Scholar API.
 * Rate limit is 100 requests per 5 minutes without an API key.
 * Adding a 600ms delay between requests.
 * @param {string} paperTitle 
 * @returns {Promise<string | null>}
 */
async function fetchTldr(paperTitle) {
  if (!paperTitle) return null;

  try {
    const encodedQuery = encodeURIComponent(paperTitle);
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodedQuery}&fields=tldr,title,externalIds&limit=1`;
    
    // Add delay for rate limiting
    await delay(600);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ReOpSy/1.0',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.warn('Semantic Scholar rate limit hit.');
      } else {
        console.warn(`Semantic Scholar API returned ${response.status}`);
      }
      return null;
    }

    const data = await response.json();
    if (data.data && data.data.length > 0) {
      const paper = data.data[0];
      if (paper.tldr && paper.tldr.text) {
        return paper.tldr.text;
      }
    }
  } catch (error) {
    console.warn(`Semantic Scholar fetch failed for "${paperTitle}":`, error.message);
  }

  return null;
}

module.exports = {
  fetchTldr
};
