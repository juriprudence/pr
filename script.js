const articleNumberInput = document.getElementById('articleNumber');
const resultsDiv = document.getElementById('results');
const allArticlesDiv = document.getElementById('all-articles');
let allArticles = [];
let titlesData = [];
let tfidfIndex = null;

window.addEventListener('DOMContentLoaded', async () => {
    const data = await loadArticlesAndTitles();
    allArticles = data.articles;
    titlesData = data.titles;
    // Pre-build TF-IDF index for better performance
    buildTfIdfIndex();
    displayAllArticles(allArticles);
});

class ArabicTokenizer {
    constructor(options = {}) {
        // Configuration options
        this.removeStopWords = options.removeStopWords ?? true;
        this.normalizeDiacritics = options.normalizeDiacritics ?? true;
        this.normalizeAlef = options.normalizeAlef ?? true;
        this.minTokenLength = options.minTokenLength ?? 2;
        this.keepNumbers = options.keepNumbers ?? false;
        this.keepEnglish = options.keepEnglish ?? false;
        
        // Arabic stop words (common words to filter out)
        this.stopWords = new Set([
            'في', 'من', 'إلى', 'على', 'عن', 'مع', 'هذا', 'هذه', 'ذلك', 'تلك',
            'التي', 'الذي', 'اللتان', 'اللذان', 'اللتين', 'اللذين', 'اللاتي', 'اللواتي',
            'ما', 'هو', 'هي', 'هم', 'هن', 'أن', 'إن', 'كان', 'كانت', 'يكون', 'تكون',
            'قد', 'لقد', 'كل', 'بعض', 'عند', 'لدى', 'حتى', 'قبل', 'بعد', 'أمام', 'خلف',
            'فوق', 'تحت', 'يمين', 'يسار', 'شمال', 'جنوب', 'شرق', 'غرب', 'أو', 'أم',
            'لكن', 'لكن', 'إذا', 'إذ', 'منذ', 'حين', 'حيث', 'كيف', 'كم', 'متى', 'أين',
            'لماذا', 'ماذا', 'من', 'أي', 'كذلك', 'أيضا', 'فقط', 'عندما', 'ثم', 'أما'
        ]);
        
        // Common Arabic prefixes and suffixes
        this.prefixes = ['ال', 'و', 'ف', 'ب', 'ك', 'ل', 'لل'];
        this.suffixes = ['ها', 'ان', 'ين', 'ون', 'ات', 'ة', 'ه', 'ي', 'ك', 'ت', 'كم', 'كن', 'نا', 'ني', 'هم', 'هن', 'كما', 'هما'];
    }
    
    // Normalize Arabic characters
    normalizeArabic(text) {
        if (this.normalizeAlef) {
            // Normalize different forms of Alef
            text = text.replace(/[آأإٱ]/g, 'ا');
        }
        
        if (this.normalizeDiacritics) {
            // Remove Arabic diacritics (tashkeel)
            text = text.replace(/[\u064B-\u065F\u0670]/g, '');
        }
        
        // Normalize Yaa and Alef Maqsura
        text = text.replace(/ى/g, 'ي');
        
        // Normalize Taa Marbouta
        text = text.replace(/ة/g, 'ه');
        
        // Remove Tatweel (character elongation)
        text = text.replace(/ـ/g, '');
        
        return text;
    }
    
    // Remove common prefixes
    removePrefix(token) {
        for (let prefix of this.prefixes) {
            if (token.startsWith(prefix) && token.length > prefix.length + 1) {
                return token.substring(prefix.length);
            }
        }
        return token;
    }
    
    // Remove common suffixes
    removeSuffix(token) {
        for (let suffix of this.suffixes) {
            if (token.endsWith(suffix) && token.length > suffix.length + 1) {
                return token.substring(0, token.length - suffix.length);
            }
        }
        return token;
    }
    
    // Light stemming for Arabic
    lightStem(token) {
        // Remove definite article 'ال' if at the beginning
        if (token.startsWith('ال') && token.length > 2) {
            token = token.substring(2);
        }
        
        // Remove common conjunction prefixes
        if (token.startsWith('و') && token.length > 1) {
            token = token.substring(1);
        }
        
        // Remove possessive pronouns at the end
        const possessivePronouns = ['ني', 'نا', 'ها', 'هم', 'هن', 'كم', 'كن', 'ه', 'ك', 'ي'];
        for (let pronoun of possessivePronouns) {
            if (token.endsWith(pronoun) && token.length > pronoun.length + 1) {
                token = token.substring(0, token.length - pronoun.length);
                break;
            }
        }
        
        return token;
    }
    
    // Check if token is valid Arabic word
    isValidArabicToken(token) {
        // Must contain at least one Arabic character
        return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(token);
    }
    
    // Main tokenization function
    tokenize(text, options = {}) {
        // Merge options with instance options
        const opts = { ...this, ...options };
        
        // Normalize the text
        let normalizedText = this.normalizeArabic(text);
        
        // Convert to lowercase (for any Latin characters)
        normalizedText = normalizedText.toLowerCase();
        
        // Define what to keep based on options
        let regex;
        if (opts.keepNumbers && opts.keepEnglish) {
            // Keep Arabic, English, and numbers
            regex = /[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFFa-zA-Z0-9\s]/g;
        } else if (opts.keepNumbers) {
            // Keep Arabic and numbers only
            regex = /[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF0-9\s]/g;
        } else if (opts.keepEnglish) {
            // Keep Arabic and English only
            regex = /[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFFa-zA-Z\s]/g;
        } else {
            // Keep Arabic only
            regex = /[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\s]/g;
        }
        
        // Remove unwanted characters
        normalizedText = normalizedText.replace(regex, ' ');
        
        // Split into tokens
        let tokens = normalizedText.split(/\s+/).filter(token => token.length > 0);
        
        // Process each token
        tokens = tokens.map(token => {
            // Light stemming
            if (opts.lightStem) {
                token = this.lightStem(token);
            }
            
            // Remove prefixes and suffixes if requested
            if (opts.removePrefixes) {
                token = this.removePrefix(token);
            }
            if (opts.removeSuffixes) {
                token = this.removeSuffix(token);
            }
            
            return token;
        });
        
        // Filter tokens
        tokens = tokens.filter(token => {
            // Check minimum length
            if (token.length < opts.minTokenLength) {
                return false;
            }
            
            // Remove stop words if requested
            if (opts.removeStopWords && this.stopWords.has(token)) {
                return false;
            }
            
            // Ensure it's a valid Arabic token (unless we're keeping English/numbers)
            if (!opts.keepEnglish && !opts.keepNumbers) {
                return this.isValidArabicToken(token);
            }
            
            return true;
        });
        
        return tokens;
    }
    
    // Get token frequencies
    getTokenFrequencies(text, options = {}) {
        const tokens = this.tokenize(text, options);
        const frequencies = {};
        
        for (let token of tokens) {
            frequencies[token] = (frequencies[token] || 0) + 1;
        }
        
        // Sort by frequency
        return Object.entries(frequencies)
            .sort((a, b) => b[1] - a[1])
            .reduce((acc, [token, freq]) => {
                acc[token] = freq;
                return acc;
            }, {});
    }
    
    // N-gram generation
    generateNgrams(text, n = 2, options = {}) {
        const tokens = this.tokenize(text, options);
        const ngrams = [];
        
        for (let i = 0; i <= tokens.length - n; i++) {
            ngrams.push(tokens.slice(i, i + n).join(' '));
        }
        
        return ngrams;
    }
    
    // Extract root patterns (advanced stemming)
    extractRootPattern(token) {
        // This is a simplified version - real Arabic root extraction is complex
        // Remove common affixes
        let root = token;
        
        // Remove definite article
        if (root.startsWith('ال')) {
            root = root.substring(2);
        }
        
        // Remove common prefixes
        const prefixPatterns = ['مست', 'مت', 'م', 'ت', 'ي', 'ن', 'أ'];
        for (let prefix of prefixPatterns) {
            if (root.startsWith(prefix) && root.length > prefix.length + 2) {
                root = root.substring(prefix.length);
                break;
            }
        }
        
        // Remove common suffixes
        const suffixPatterns = ['يون', 'ات', 'ان', 'ين', 'ون', 'ة', 'ه', 'ي'];
        for (let suffix of suffixPatterns) {
            if (root.endsWith(suffix) && root.length > suffix.length + 2) {
                root = root.substring(0, root.length - suffix.length);
                break;
            }
        }
        
        return root;
    }
}

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

    // Search in titles first
    const titleSearchResults = searchInTitles(query);
    
    // Search in article content using TF-IDF
    const contentSearchResults = performTfIdfSearch(query);
    
    // Combine and deduplicate results, prioritizing title matches
    const combinedResults = combineSearchResults(titleSearchResults, contentSearchResults);
    
    if (combinedResults.length > 0) {
        displaySearchResults(combinedResults);
    } else {
        resultsDiv.innerHTML = '<h2>نتائج البحث</h2><p>لم يتم العثور على نتائج.</p>';
    }
    allArticlesDiv.style.display = 'none';
}

// New function to handle clicking on search results
function navigateToArticle(articleNumber) {
    // Clear search input
    articleNumberInput.value = '';
    
    // Hide search results
    resultsDiv.innerHTML = '';
    
    // Show all articles
    allArticlesDiv.style.display = 'block';
    
    // Scroll to the specific article with smooth animation
    setTimeout(() => {
        const articleElement = document.getElementById(`article-${articleNumber}`);
        if (articleElement) {
            articleElement.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center' 
            });
            
            // Add highlight effect
            articleElement.classList.add('highlighted-article');
            setTimeout(() => {
                articleElement.classList.remove('highlighted-article');
            }, 3000); // Remove highlight after 3 seconds
        }
    }, 100);
}

// New function to search in titles
function searchInTitles(query) {
    const tokenizer = new ArabicTokenizer({
        removeStopWords: true,
        minTokenLength: 2,
        lightStem: true
    });
    
    const queryTokens = tokenizer.tokenize(query.toLowerCase());
    const titleResults = [];
    
    titlesData.forEach(titleData => {
        const titleTokens = tokenizer.tokenize(titleData.title.toLowerCase());
        
        // Calculate similarity score between query and title
        let matchScore = 0;
        let totalQueryTokens = queryTokens.length;
        
        queryTokens.forEach(queryToken => {
            // Check for exact matches
            if (titleTokens.includes(queryToken)) {
                matchScore += 1;
            } else {
                // Check for partial matches (substring matching)
                titleTokens.forEach(titleToken => {
                    if (titleToken.includes(queryToken) || queryToken.includes(titleToken)) {
                        matchScore += 0.5; // Lower score for partial matches
                    }
                });
            }
        });
        
        // Calculate match percentage
        const matchPercentage = totalQueryTokens > 0 ? matchScore / totalQueryTokens : 0;
        
        if (matchPercentage > 0.3) { // Minimum 30% match threshold
            // Find the first article after this title
            const articleAfterTitle = allArticles.find(article => 
                parseInt(article.number) >= titleData.beforeArticle
            );
            
            if (articleAfterTitle) {
                titleResults.push({
                    article: articleAfterTitle,
                    matchScore: matchPercentage,
                    matchedTitle: titleData.title,
                    isFromTitle: true
                });
            }
        }
    });
    
    // Sort by match score (highest first)
    return titleResults.sort((a, b) => b.matchScore - a.matchScore);
}

// Function to combine title search results with content search results
function combineSearchResults(titleResults, contentResults) {
    const combinedMap = new Map();
    
    // Add title results first (they get priority)
    titleResults.forEach(result => {
        combinedMap.set(result.article.number, {
            ...result,
            priority: 1 // Higher priority for title matches
        });
    });
    
    // Add content results, but don't override title matches
    contentResults.forEach(article => {
        if (!combinedMap.has(article.number)) {
            combinedMap.set(article.number, {
                article: article,
                matchScore: 0.5, // Default score for content matches
                isFromTitle: false,
                priority: 2 // Lower priority for content matches
            });
        }
    });
    
    // Convert to array and sort by priority, then by match score
    return Array.from(combinedMap.values())
        .sort((a, b) => {
            if (a.priority !== b.priority) {
                return a.priority - b.priority; // Lower number = higher priority
            }
            return b.matchScore - a.matchScore; // Higher score first
        })
        .map(result => result.article)
        .slice(0, 20); // Limit to top 20 results
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

async function loadArticlesAndTitles() {
    try {
        const response = await fetch('code.txt');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const text = await response.text();
        
        // Parse titles first
        const titles = [];
        const titleRegex = /<title>(.*?)<\/title>\s*<beforarticle>(\d+)<\/beforarticle>/g;
        let titleMatch;
        
        while ((titleMatch = titleRegex.exec(text)) !== null) {
            titles.push({
                title: titleMatch[1].trim(),
                beforeArticle: parseInt(titleMatch[2])
            });
        }
        
        // Parse articles
        const articles = [];
        const articleRegex = /<articlenum>(\d+)<\/articlenum><articlecontent>([\s\S]*?)<\/articlecontent>/g;
        let articleMatch;
        
        while ((articleMatch = articleRegex.exec(text)) !== null) {
            const articleNum = parseInt(articleMatch[1]);
            const content = articleMatch[2].trim().replace(/\s+/g, ' ');
            
            articles.push({
                number: articleMatch[1],
                content: content,
                title: null // Initialize as null, will be set properly later
            });
        }
        
        console.log(`Loaded ${articles.length} articles and ${titles.length} titles`);
        return { articles, titles };
    } catch (error) {
        console.error('Error loading articles and titles:', error);
        return { articles: [], titles: [] };
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

// Fixed function to get title only for the specific article it should appear before
function getTitleForArticle(articleNumber) {
    const numericArticleNumber = parseInt(articleNumber);
    // Find title that should appear exactly before this article number
    const exactTitle = titlesData.find(t => t.beforeArticle === numericArticleNumber);
    return exactTitle ? exactTitle.title : null;
}

function displayResults(mainArticle, similarArticles) {
    const title = getTitleForArticle(mainArticle.number);
    let html = '';
    
    if (title) {
        html += `<div class="article-title">${title}</div>`;
    }
    
    html += `<h2>المادة ${mainArticle.number}</h2><div class="main-article"><p>${mainArticle.content}</p></div>`;
    
    if (similarArticles.length > 0) {
        html += '<h3>مواد مشابهة:</h3>';
        html += '<div class="similar-articles">';
        similarArticles.forEach(article => {
            const preview = article.content.length > 100 
                ? article.content.substring(0, 100) + '...' 
                : article.content;
            const articleTitle = getTitleForArticle(article.number);
            
            html += `<div class="similar-article clickable-result" onclick="navigateToArticle('${article.number}')">`;
            if (articleTitle) {
                html += `<div class="article-title-small">${articleTitle}</div>`;
            }
            html += `<strong>المادة ${article.number}</strong>: ${preview}</div>`;
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
        
        // Group results by their source (title vs content)
        const titleMatches = [];
        const contentMatches = [];
        
        articles.forEach(article => {
            // Check if this article was found through title search
            const titleMatch = titlesData.find(titleData => {
                const articleAfterTitle = allArticles.find(a => 
                    parseInt(a.number) >= titleData.beforeArticle
                );
                return articleAfterTitle && articleAfterTitle.number === article.number;
            });
            
            if (titleMatch) {
                titleMatches.push({article, matchedTitle: titleMatch.title});
            } else {
                contentMatches.push({article});
            }
        });
        
        // Display title matches first
        if (titleMatches.length > 0) {
            html += '<h3>نتائج من العناوين:</h3>';
            titleMatches.forEach(match => {
                const title = getTitleForArticle(match.article.number);
                
                html += `<div class="article search-result title-match clickable-result" onclick="navigateToArticle('${match.article.number}')">`;
                if (title) {
                    html += `<div class="article-title highlighted-title">${title}</div>`;
                }
                html += `<h3>المادة ${match.article.number}</h3>
                    <p>${match.article.content}</p>
                    <div class="search-source">🔍 تم العثور عليها من خلال العنوان</div>
                </div>`;
            });
        }
        
        // Display content matches
        if (contentMatches.length > 0 && titleMatches.length > 0) {
            html += '<h3>نتائج من المحتوى:</h3>';
        }
        
        contentMatches.forEach(match => {
            const title = getTitleForArticle(match.article.number);
            
            html += `<div class="article search-result content-match clickable-result" onclick="navigateToArticle('${match.article.number}')">`;
            if (title) {
                html += `<div class="article-title">${title}</div>`;
            }
            html += `<h3>المادة ${match.article.number}</h3>
                <p>${match.article.content}</p>
                <div class="search-source">🔍 تم العثور عليها من خلال المحتوى</div>
            </div>`;
        });
    }
    resultsDiv.innerHTML = html;
}

function displayAllArticles(articles) {
    let html = '<h2>جميع المواد</h2>';
    
    // Sort articles by number to ensure proper order
    const sortedArticles = [...articles].sort((a, b) => parseInt(a.number) - parseInt(b.number));
    
    sortedArticles.forEach(article => {
        const title = getTitleForArticle(article.number);
        
        html += `<div class="article" id="article-${article.number}">`;
        if (title) {
            html += `<div class="article-title">${title}</div>`;
        }
        html += `<h3>المادة ${article.number}</h3>
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
        const tokenizer = new ArabicTokenizer({
            removeStopWords: true,
            minTokenLength: 2,
            lightStem: true
        });
        // Enhanced tokenization for Arabic text
        return tokenizer.tokenize(text) // Filter out single character tokens
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