// lib/dictionary.js
//
// Language dictionaries for text processing.
// Stopwords sourced from standard NLP lists + common verbs for username parsing.

/**
 * English stopwords - words that should NOT be part of @username or #topic references.
 * Includes:
 * - Standard NLP stopwords (articles, prepositions, conjunctions, pronouns)
 * - Common verbs that appear after @username (like, likes, eat, using, etc.)
 * - Question words
 * - Auxiliary/modal verbs
 */
export const STOPWORDS_EN = new Set([
  // Articles
  "a", "an", "the",
  
  // Conjunctions
  "and", "or", "but", "nor", "so", "yet", "for", "because", "although", "though",
  "while", "whereas", "unless", "until", "since", "after", "before",
  
  // Prepositions
  "in", "on", "at", "to", "for", "with", "about", "from", "by", "of", "off",
  "into", "onto", "upon", "over", "under", "above", "below", "between", "among",
  "through", "during", "without", "within", "against", "toward", "towards",
  "around", "across", "along", "behind", "beside", "besides", "beyond",
  
  // Pronouns
  "i", "me", "my", "mine", "myself",
  "you", "your", "yours", "yourself", "yourselves",
  "he", "him", "his", "himself",
  "she", "her", "hers", "herself",
  "it", "its", "itself",
  "we", "us", "our", "ours", "ourselves",
  "they", "them", "their", "theirs", "themselves",
  "who", "whom", "whose", "which", "what", "that", "this", "these", "those",
  "anyone", "everyone", "someone", "nobody", "everybody", "somebody",
  "anything", "everything", "something", "nothing",
  
  // Demonstratives & determiners
  "all", "any", "both", "each", "every", "few", "many", "most", "much",
  "neither", "none", "one", "other", "several", "some", "such",
  
  // Question words
  "how", "why", "when", "where", "whether",
  
  // Auxiliary verbs (be)
  "am", "is", "are", "was", "were", "be", "been", "being",
  
  // Auxiliary verbs (have)
  "have", "has", "had", "having",
  
  // Auxiliary verbs (do)
  "do", "does", "did", "doing", "done",
  
  // Modal verbs
  "will", "would", "shall", "should", "can", "could", "may", "might", "must",
  "ought", "need", "dare",
  
  // Common verbs (these often follow @username in questions)
  "like", "likes", "liked", "liking",
  "love", "loves", "loved", "loving",
  "hate", "hates", "hated", "hating",
  "want", "wants", "wanted", "wanting",
  "need", "needs", "needed", "needing",
  "use", "uses", "used", "using",
  "eat", "eats", "ate", "eaten", "eating",
  "drink", "drinks", "drank", "drunk", "drinking",
  "play", "plays", "played", "playing",
  "know", "knows", "knew", "known", "knowing",
  "think", "thinks", "thought", "thinking",
  "say", "says", "said", "saying",
  "get", "gets", "got", "gotten", "getting",
  "make", "makes", "made", "making",
  "go", "goes", "went", "gone", "going",
  "come", "comes", "came", "coming",
  "see", "sees", "saw", "seen", "seeing",
  "look", "looks", "looked", "looking",
  "find", "finds", "found", "finding",
  "give", "gives", "gave", "given", "giving",
  "take", "takes", "took", "taken", "taking",
  "tell", "tells", "told", "telling",
  "ask", "asks", "asked", "asking",
  "work", "works", "worked", "working",
  "call", "calls", "called", "calling",
  "try", "tries", "tried", "trying",
  "feel", "feels", "felt", "feeling",
  "become", "becomes", "became", "becoming",
  "leave", "leaves", "left", "leaving",
  "put", "puts", "putting",
  "mean", "means", "meant", "meaning",
  "keep", "keeps", "kept", "keeping",
  "let", "lets", "letting",
  "begin", "begins", "began", "begun", "beginning",
  "seem", "seems", "seemed", "seeming",
  "help", "helps", "helped", "helping",
  "show", "shows", "showed", "shown", "showing",
  "hear", "hears", "heard", "hearing",
  "run", "runs", "ran", "running",
  "move", "moves", "moved", "moving",
  "live", "lives", "lived", "living",
  "believe", "believes", "believed", "believing",
  "hold", "holds", "held", "holding",
  "bring", "brings", "brought", "bringing",
  "happen", "happens", "happened", "happening",
  "write", "writes", "wrote", "written", "writing",
  "provide", "provides", "provided", "providing",
  "sit", "sits", "sat", "sitting",
  "stand", "stands", "stood", "standing",
  "lose", "loses", "lost", "losing",
  "pay", "pays", "paid", "paying",
  "meet", "meets", "met", "meeting",
  "include", "includes", "included", "including",
  "continue", "continues", "continued", "continuing",
  "set", "sets", "setting",
  "learn", "learns", "learned", "learnt", "learning",
  "change", "changes", "changed", "changing",
  "lead", "leads", "led", "leading",
  "understand", "understands", "understood", "understanding",
  "watch", "watches", "watched", "watching",
  "follow", "follows", "followed", "following",
  "stop", "stops", "stopped", "stopping",
  "create", "creates", "created", "creating",
  "speak", "speaks", "spoke", "spoken", "speaking",
  "read", "reads", "reading",
  "spend", "spends", "spent", "spending",
  "grow", "grows", "grew", "grown", "growing",
  "open", "opens", "opened", "opening",
  "walk", "walks", "walked", "walking",
  "win", "wins", "won", "winning",
  "offer", "offers", "offered", "offering",
  "remember", "remembers", "remembered", "remembering",
  "consider", "considers", "considered", "considering",
  "appear", "appears", "appeared", "appearing",
  "buy", "buys", "bought", "buying",
  "wait", "waits", "waited", "waiting",
  "serve", "serves", "served", "serving",
  "die", "dies", "died", "dying",
  "send", "sends", "sent", "sending",
  "expect", "expects", "expected", "expecting",
  "build", "builds", "built", "building",
  "stay", "stays", "stayed", "staying",
  "fall", "falls", "fell", "fallen", "falling",
  "cut", "cuts", "cutting",
  "reach", "reaches", "reached", "reaching",
  "kill", "kills", "killed", "killing",
  "remain", "remains", "remained", "remaining",
  "suggest", "suggests", "suggested", "suggesting",
  "raise", "raises", "raised", "raising",
  "pass", "passes", "passed", "passing",
  "sell", "sells", "sold", "selling",
  "require", "requires", "required", "requiring",
  "report", "reports", "reported", "reporting",
  "decide", "decides", "decided", "deciding",
  "pull", "pulls", "pulled", "pulling",
  
  // Adverbs
  "also", "too", "then", "than", "now", "just", "only", "even", "still",
  "already", "always", "never", "ever", "often", "sometimes", "usually",
  "really", "very", "quite", "rather", "almost", "enough", "perhaps", "maybe",
  "probably", "certainly", "definitely", "actually", "basically", "simply",
  "here", "there", "everywhere", "somewhere", "nowhere", "anywhere",
  "today", "tomorrow", "yesterday", "soon", "later", "earlier",
  
  // Misc function words
  "as", "if", "else", "no", "not", "yes", "ok", "okay",
  "well", "oh", "ah", "um", "uh", "hmm", "hm",
  "please", "thanks", "thank",
  
  // Contractions (without apostrophe, in case input is normalized)
  "dont", "doesnt", "didnt", "wont", "wouldnt", "cant", "couldnt",
  "shouldnt", "isnt", "arent", "wasnt", "werent", "hasnt", "havent", "hadnt",
  "ive", "youve", "weve", "theyve", "hes", "shes", "its", "thats", "whats",
  "im", "youre", "were", "theyre", "ill", "youll", "hell", "shell", "well", "theyll",
]);

/**
 * Check if a word is a stopword (case-insensitive)
 * @param {string} word
 * @returns {boolean}
 */
export function isStopword(word) {
  return STOPWORDS_EN.has(String(word).toLowerCase());
}

/**
 * Remove stopwords from an array of words
 * @param {string[]} words
 * @returns {string[]}
 */
export function removeStopwords(words) {
  return words.filter(w => !isStopword(w));
}

/**
 * Get the first N non-stopword tokens from text
 * Stops at first stopword encountered
 * @param {string} text - Text to extract from (already split or will be split)
 * @param {number} maxWords - Maximum words to return
 * @returns {string[]}
 */
export function extractUntilStopword(text, maxWords = 3) {
  const words = typeof text === 'string' ? text.split(/\s+/) : text;
  const result = [];
  
  for (const word of words.slice(0, maxWords + 2)) { // Check a bit beyond max
    if (isStopword(word)) break;
    result.push(word);
    if (result.length >= maxWords) break;
  }
  
  return result;
}

export default {
  STOPWORDS_EN,
  isStopword,
  removeStopwords,
  extractUntilStopword,
};
