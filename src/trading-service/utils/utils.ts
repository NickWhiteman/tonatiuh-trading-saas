/**
 * @description class Utils for methods help in writing code
 */
export class Utils {

    /**
     * @description method for string mutation first letter lowercase in uppercase
     * @param {string} word for operation example 'word'
     * @returns {string} string with Upper letter example 'Word'
     */
    static returnStringWithUpperLetter(word: string): string {
        const letter = word[0].toUpperCase();
        const wordWithoutFirstSymbol = word.slice(1);
    
        return `${letter}${wordWithoutFirstSymbol}`;
    }
    
}