class ArabicTokenizer {
    constructor(options = {}) {
        // Configuration options
        this.removeStopWords = options.removeStopWords ?? true;
        this.normalizeDiacritics = options.normalizeDiacritics ?? true;
        this.normalizeAlef = options.normalizeAlef ?? true;
        this.minTokenLength = options.minTokenLength ?? 2;
        this.keepNumbers = options.keepNumbers ?? false;
        this.keepEnglish = options.keepEnglish ?? false;
        this.lightStem = options.lightStem ?? false;
        
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
        // Use instance options, allowing for overrides from the options parameter
        const lightStem = options.lightStem ?? this.lightStem;
        const removeStopWords = options.removeStopWords ?? this.removeStopWords;
        const minTokenLength = options.minTokenLength ?? this.minTokenLength;
        const keepNumbers = options.keepNumbers ?? this.keepNumbers;
        const keepEnglish = options.keepEnglish ?? this.keepEnglish;
        
        // Normalize the text
        let normalizedText = this.normalizeArabic(text);
        
        // Convert to lowercase (for any Latin characters)
        normalizedText = normalizedText.toLowerCase();
        
        // Define what to keep based on options
        let regex;
        if (keepNumbers && keepEnglish) {
            // Keep Arabic, English, and numbers
            regex = /[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFFa-zA-Z0-9\s]/g;
        } else if (keepNumbers) {
            // Keep Arabic and numbers only
            regex = /[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF0-9\s]/g;
        } else if (keepEnglish) {
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
            if (lightStem) {
                token = this.lightStem(token);
            }
            
            return token;
        });
        
        // Filter tokens
        tokens = tokens.filter(token => {
            // Check minimum length
            if (token.length < minTokenLength) {
                return false;
            }
            
            // Remove stop words if requested
            if (removeStopWords && this.stopWords.has(token)) {
                return false;
            }
            
            // Ensure it's a valid Arabic token (unless we're keeping English/numbers)
            if (!keepEnglish && !keepNumbers) {
                return this.isValidArabicToken(token);
            }
            
            return true;
        });
        
        return tokens;
    }
}

export default ArabicTokenizer;