var jsdom = require('jsdom');
var fs = require('fs');
var jquery = fs.readFileSync('./jquery-1.11.1.min.js', 'utf-8').toString();

String.prototype.sort = function() {
	return this.split('').sort().join('');
}

String.prototype.replaceAt = function(index, character) {
    return this.substr(0, index) + character + this.substr(index + character.length);
}

var words = {};
var wordSum = 0;

function loadWordFile(filename, swap) {
	console.log('Loading wordfile', filename);
	var wordLines = fs.readFileSync(filename).toString().split(/\r?\n/);
	for (var i = 0; i < wordLines.length; i++) {
		var s = wordLines[i].split(/\s/);
		if (s.length < 2)
			continue;

		if (swap)
			s = [s[1], s[0]];

		var sorted = s[1].sort();

		if (!(sorted in words))
			words[sorted] = [];

		var j;
		for (j = 0; j < words[sorted].length; j++) {
			if (words[sorted][j].word == s[1]) {
				words[sorted][j].count += parseInt(s[0]);
				break;
			}
		}

		if (j == words[sorted].length)
			words[sorted].push({word: s[1], count: parseInt(s[0])});

		wordSum += parseInt(s[0]);
	}
}

loadWordFile('sonavorm_kahanevas.txt', false);
loadWordFile('et.txt', true);

for (var sorted in words) {
	words[sorted].sort(function(lhs, rhs) {
		rhs.count - lhs.count;
	});
}

console.log('Loading bigramfile');
var bigramLines = fs.readFileSync('2_gramm_koond_sonavorm_sort_x_va10').toString().split(/\r?\n/);
var bigrams = {};
var bigramSum = 0;
for (var i = 0; i < bigramLines.length; i++) {
	var s = bigramLines[i].trim().replace(/#z#/g, '').split(/\s/);
	if (s.length < 3)
		continue;
	
	bigrams[[s[1], s[2]]] = parseInt(s[0]);
	bigramSum += parseInt(s[0]);
}
bigramLines = null;

function mimicCapital(word, mask) {
	for (var i = 0; i < mask.length; i++) {
		if (mask[i].match(/[A-ZÕÜÄÖ]/)) {
			word = word.replaceAt(i, word[i].toUpperCase());
		}
	}
	return word;
}

module.exports.unscramble = function(content, extra, callback) {
	var extras = {}; // known words from article intro
	extra.replace(/[A-ZÕÜÄÖa-zäöõü]+/g, function(match) {
		var sorted = match.toLowerCase().sort();

		if (!(sorted in extras))
			extras[sorted] = [];

		var i;
		for (i = 0; i < extras[sorted].length; i++) { // find word in extras[sorted]
			if (extras[sorted][i].word == match.toLowerCase()) {
				extras[sorted][i].count++;
				break;
			}
		}

		if (i == extras[sorted].length) { // word was not found in extras[sorted], add it
			extras[sorted].push({word: match.toLowerCase(), count: 1});
		}
	});

	for (var sorted in extras) { // sort descendingly to get most probable matches first
		extras[sorted].sort(function(lhs, rhs) {
			rhs.count - lhs.count;
		});
	}

	jsdom.env({html: content, src: [jquery], done: function(err, window) {
		var $ = window.jQuery;

		var prev = ''; // previous word
		$('*:not(:has(*)):not(script)').text(function(i, text) { // all elements with no children (but can have text)
			return text.replace(/[A-ZÕÜÄÖa-zäöõü]+|[.,](?=\s)/g, function(match) {
				if (match.match(/[.,]/)) { // remember punctuation as previous
					prev = match;
					return match;
				}

				var sorted = match.toLowerCase().sort();

				if (sorted in extras) { // known word from article intro
					var word = mimicCapital(extras[sorted][0].word, match);
					prev = word;
					return word;
				}
				if (sorted in words) { // known word from wordlist
					var cands = words[sorted]; // word candidates
					// naive bayesian classifier
					for (var i = 0; i < cands.length; i++) {
						cands[i].prob = (cands[i].count / wordSum) * ((bigrams[[prev, cands[i].word]] || 1) / bigramSum);
					}
					cands.sort(function(lhs, rhs) {
						return rhs.prob - lhs.prob;
					});

					var word = mimicCapital(cands[0].word, match);
					prev = word;
					return word;
				}
				else { // unknown word
					prev = match;
					return "[" + match + "]";
				}
			});
		});

		(callback || function(){})($('body').html());
	}});
}
