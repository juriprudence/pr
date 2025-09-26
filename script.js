const articleNumberInput = document.getElementById('articleNumber');
const resultsDiv = document.getElementById('results');
const allArticlesDiv = document.getElementById('all-articles');
let allArticles = [];
let tfidfIndex = null;

window.addEventListener('DOMContentLoaded', async () => {
    allArticles = await loadArticles();
    // Pre-build TF-IDF index for better performance
    buildTfIdfIndex();
    displayAllArticles(allArticles);
});

articleNumberInput.addEventListener('input', () => {
    const query = articleNumberInput.value.trim();
    if (query) {
        performSearch(query);
    } else {
        resultsDiv.innerHTML = '';
        allArticlesDiv.style.display = 'block';
    }
});

function buildTfIdfIndex() {
    tfidfIndex = new TfIdf();
    allArticles.forEach(article => {
        tfidfIndex.addDocument(article.content);
    });
}

function performSearch(query) {
    // If the query is a number and matches an article number, show that article and similar ones.
    const articleByNumber = allArticles.find(a => a.number === query);
    if (articleByNumber) {
        const similarArticles = findSimilarArticles(articleByNumber);
        displayResults(articleByNumber, similarArticles);
        allArticlesDiv.style.display = 'none';
        return;
    }

    // For text queries, use TF-IDF to find and rank all relevant articles.
    const searchResults = performTfIdfSearch(query);
    
    if (searchResults.length > 0) {
        displaySearchResults(searchResults);
    } else {
        resultsDiv.innerHTML = '<h2>نتائج البحث</h2><p>لم يتم العثور على نتائج.</p>';
    }
    allArticlesDiv.style.display = 'none';
}

function performTfIdfSearch(query) {
    const searchResults = [];
    const minScore = 0.001; // Minimum relevance threshold
    
    tfidfIndex.tfidfs(query, (i, measure) => {
        if (measure > minScore) {
            searchResults.push({ 
                article: allArticles[i], 
                score: measure 
            });
        }
    });

    // Sort results by relevance score (highest first)
    searchResults.sort((a, b) => b.score - a.score);
    
    // Return top 20 results to avoid overwhelming the user
    return searchResults.slice(0, 20).map(r => r.article);
}

async function loadArticles() {
    try {
        const response = await fetch('code.txt');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const text = await response.text();
        const articles = [];
        const articleRegex = /<articlenum>(\d+)<\/articlenum><articlecontent>([\s\S]*?)<\/articlecontent>/g;
        let match;
        
        while ((match = articleRegex.exec(text)) !== null) {
            articles.push({
                number: match[1],
                content: match[2].trim().replace(/\s+/g, ' ')
            });
        }
        
        console.log(`Loaded ${articles.length} articles`);
        return articles;
    } catch (error) {
        console.error('Error loading articles:', error);
        return [];
    }
}

function findSimilarArticles(targetArticle) {
    const similarities = [];
    const targetIndex = allArticles.findIndex(a => a.number === targetArticle.number);
    
    if (targetIndex === -1) return [];
    
    tfidfIndex.tfidfs(targetArticle.content, (i, measure) => {
        if (i !== targetIndex && measure > 0.001) {
            similarities.push({ 
                index: i, 
                score: measure,
                article: allArticles[i]
            });
        }
    });

    similarities.sort((a, b) => b.score - a.score);
    return similarities.slice(0, 5).map(s => s.article);
}

function displayResults(mainArticle, similarArticles) {
    let html = `<h2>المادة ${mainArticle.number}</h2><div class="main-article"><p>${mainArticle.content}</p></div>`;
    
    if (similarArticles.length > 0) {
        html += '<h3>مواد مشابهة:</h3>';
        html += '<div class="similar-articles">';
        similarArticles.forEach(article => {
            const preview = article.content.length > 100 
                ? article.content.substring(0, 100) + '...' 
                : article.content;
            html += `<div class="similar-article">
                <strong>المادة ${article.number}</strong>: ${preview}
            </div>`;
        });
        html += '</div>';
    }
    resultsDiv.innerHTML = html;
}

function displaySearchResults(articles) {
    let html = '<h2>نتائج البحث</h2>';
    if (articles.length === 0) {
        html += '<p>لم يتم العثور على نتائج.</p>';
    } else {
        html += `<p>تم العثور على ${articles.length} نتيجة:</p>`;
        articles.forEach((article, index) => {
            html += `<div class="article search-result">
                <h3>المادة ${article.number}</h3>
                <p>${article.content}</p>
            </div>`;
        });
    }
    resultsDiv.innerHTML = html;
}

function displayAllArticles(articles) {
    let html = '<h2>جميع المواد</h2>';
    articles.forEach(article => {
        html += `<div class="article">
            <h3>المادة ${article.number}</h3>
            <p>${article.content}</p>
        </div>`;
    });
    allArticlesDiv.innerHTML = html;
}

// Enhanced TF-IDF implementation
class TfIdf {
    constructor() {
        this.documents = [];
        this.termFrequency = [];
        this.docFrequency = {};
        this.docCount = 0;
        this.vocabulary = new Set();
    }

    addDocument(doc) {
        const terms = this.tokenize(doc);
        const termCount = {};
        
        // Count term frequencies in this document
        terms.forEach(term => {
            termCount[term] = (termCount[term] || 0) + 1;
            this.vocabulary.add(term);
        });

        // Update document frequency for each unique term in this document
        const uniqueTerms = Object.keys(termCount);
        uniqueTerms.forEach(term => {
            this.docFrequency[term] = (this.docFrequency[term] || 0) + 1;
        });

        this.termFrequency.push(termCount);
        this.documents.push(doc);
        this.docCount++;
    }

    tf(term, docIndex) {
        const doc = this.termFrequency[docIndex];
        const termCount = doc[term] || 0;
        const totalTerms = Object.values(doc).reduce((sum, count) => sum + count, 0);
        return totalTerms > 0 ? termCount / totalTerms : 0;
    }

    idf(term) {
        const docFreq = this.docFrequency[term] || 0;
        return docFreq > 0 ? Math.log(this.docCount / docFreq) : 0;
    }

    tfidf(term, docIndex) {
        return this.tf(term, docIndex) * this.idf(term);
    }

    tfidfs(query, callback) {
        const queryTerms = this.tokenize(query);
        const queryTermFreq = {};
        
        // Calculate query term frequencies
        queryTerms.forEach(term => {
            queryTermFreq[term] = (queryTermFreq[term] || 0) + 1;
        });
        
        const uniqueQueryTerms = Object.keys(queryTermFreq);
        
        for (let i = 0; i < this.docCount; i++) {
            let score = 0;
            uniqueQueryTerms.forEach(term => {
                if (this.vocabulary.has(term)) {
                    // Weight by query term frequency as well
                    const queryWeight = queryTermFreq[term];
                    score += this.tfidf(term, i) * queryWeight;
                }
            });
            callback(i, score);
        }
    }

    tokenize(text) {
        // Enhanced tokenization for Arabic text
        return text
            .toLowerCase()
            .replace(/[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFFa-zA-Z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(token => token.length > 1); // Filter out single character tokens
    }

    // Method to get term statistics (useful for debugging)
    getTermStats(term) {
        return {
            documentFrequency: this.docFrequency[term] || 0,
            idf: this.idf(term),
            inVocabulary: this.vocabulary.has(term)
        };
    }
}