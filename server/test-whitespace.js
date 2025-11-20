// Test enhanced whitespace cleanup
const striptags = require('striptags')
const { convert } = require('html-to-text')

// Copy the enhanced cleanEmailText function for testing
function cleanEmailText(text){
  if(!text) return ''
  
  // Remove excessive whitespace and normalize line breaks
  let cleaned = text
    .replace(/\r\n/g, '\n')           // Normalize line endings
    .replace(/\r/g, '\n')             // Handle old Mac line endings
    .replace(/\u00A0/g, ' ')          // Replace non-breaking spaces with regular spaces
    .replace(/\u2028/g, '\n')         // Replace line separator with newline
    .replace(/\u2029/g, '\n')         // Replace paragraph separator with newline
    .replace(/[\t\v\f\r ]+/g, ' ')    // Replace multiple whitespace chars with single space
    .replace(/\n{3,}/g, '\n\n')       // Limit consecutive line breaks to 2
    .replace(/^\s+|\s+$/gm, '')       // Trim whitespace from each line
    .replace(/\n\s*\n/g, '\n\n')      // Clean up lines with only whitespace
  
  // Remove common email artifacts and fix spacing issues
  cleaned = cleaned
    .replace(/^>.*$/gm, '')           // Remove quoted text lines
    .replace(/^From:.*$/gim, '')      // Remove forwarded email headers
    .replace(/^To:.*$/gim, '')
    .replace(/^Cc:.*$/gim, '')
    .replace(/^Subject:.*$/gim, '')
    .replace(/^Date:.*$/gim, '')
    .replace(/^Sent:.*$/gim, '')
    .replace(/^Reply-To:.*$/gim, '')
    .replace(/\s+,/g, ',')            // Remove spaces before commas
    .replace(/,(\S)/g, ', $1')        // Ensure space after commas
    .replace(/\s+\./g, '.')           // Remove spaces before periods
    .replace(/\.(\w)/g, '. $1')       // Ensure space after periods (if followed by word)
    .replace(/\s+:/g, ':')            // Remove spaces before colons
    .replace(/:(\S)/g, ': $1')        // Ensure space after colons (if followed by non-space)
    
  // Remove common signature separators
  cleaned = cleaned
    .replace(/^--\s*$/gm, '')         // Standard signature separator
    .replace(/^_{5,}$/gm, '')         // Underscore separators
    .replace(/^-{5,}$/gm, '')         // Dash separators
    .replace(/^={5,}$/gm, '')         // Equal sign separators
    
  // Remove email client footers
  cleaned = cleaned
    .replace(/Sent from my iPhone/gi, '')
    .replace(/Sent from my iPad/gi, '')
    .replace(/Sent from my Android/gi, '')
    .replace(/Sent from Outlook/gi, '')
    .replace(/Get Outlook for \w+/gi, '')
    
  // Remove tracking and unsubscribe text
  cleaned = cleaned
    .replace(/This email was sent to.*$/gim, '')
    .replace(/If you no longer wish to receive.*$/gim, '')
    .replace(/To unsubscribe.*$/gim, '')
    .replace(/Click here to unsubscribe.*$/gim, '')
    .replace(/View this email in your browser.*$/gim, '')
    
  // Remove excessive punctuation
  cleaned = cleaned
    .replace(/[!]{2,}/g, '!')         // Multiple exclamation marks
    .replace(/[?]{2,}/g, '?')         // Multiple question marks
    .replace(/[.]{3,}/g, '...')       // Multiple dots to ellipsis
    
  // Final cleanup - aggressive whitespace and newline removal
  cleaned = cleaned
    .replace(/\s+([.!?])/g, '$1')     // Remove spaces before punctuation
    .replace(/([.!?])\s+/g, '$1 ')    // Ensure single space after punctuation
    .replace(/\s*\n\s*/g, '\n')       // Remove spaces around newlines
    .replace(/\n{3,}/g, '\n\n')       // Again limit line breaks to max 2
    .replace(/^\s+|\s+$/g, '')        // Trim start and end whitespace
    .replace(/[ \t]{2,}/g, ' ')       // Final pass on multiple spaces
    
  // Remove lines that are just punctuation, very short, or only whitespace
  const lines = cleaned.split('\n').filter(line => {
    const trimmed = line.trim()
    // Keep lines that are at least 3 chars and contain word characters
    return trimmed.length > 2 && /\w/.test(trimmed) && !/^[^\w]*$/.test(trimmed)
  })
  
  // Join lines and do final whitespace cleanup
  let result = lines.join('\n')
    .replace(/\n{2,}/g, '\n\n')       // Ensure max 2 consecutive newlines
    .replace(/^\n+|\n+$/g, '')        // Remove leading/trailing newlines
    .trim()                           // Final trim
  
  return result
}

// Test cases for improved whitespace handling
console.log('Testing enhanced whitespace cleanup...\n')

const messyText = `
Hello   there    ,   this is     a test  .

With   lots    of    spaces    :   and   weird   punctuation    !


Multiple    lines   with  inconsistent      spacing   .
  
  
Another  paragraph  with  tabs	and	 spaces .  

  Final   line   with   trailing   spaces    .   
`

console.log('Before cleanup:')
console.log(JSON.stringify(messyText))
console.log('\nAfter cleanup:')
console.log(JSON.stringify(cleanEmailText(messyText)))
console.log('\nReadable result:')
console.log(cleanEmailText(messyText))
