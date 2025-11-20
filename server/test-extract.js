// Test script for the enhanced extractPlainText function
const { convert } = require('html-to-text')
const striptags = require('striptags')

// Copy the enhanced functions for testing
function extractPlainText(message){
  try{
    let textContent = ''
    
    // First try to extract from message parts
    if(message.payload && message.payload.parts && message.payload.parts.length > 0){
      textContent = extractFromParts(message.payload.parts)
    } 
    // If no parts, try direct body
    else if(message.payload && message.payload.body && message.payload.body.data){
      const mimeType = message.payload.mimeType || 'text/plain'
      const rawContent = Buffer.from(message.payload.body.data, 'base64').toString('utf8')
      textContent = processContentByMimeType(rawContent, mimeType)
    }
    
    // Fallback to snippet if no content found
    if(!textContent && message.snippet){
      textContent = message.snippet
    }
    
    // Clean and normalize the text
    return cleanEmailText(textContent)
    
  }catch(e){
    console.error('extractPlainText error:', e.message)
    return message.snippet || ''
  }
}

function extractFromParts(parts, depth = 0){
  if(depth > 3) return '' // Prevent infinite recursion
  
  let textContent = ''
  
  for(const part of parts){
    // Handle nested parts recursively
    if(part.parts && part.parts.length > 0){
      textContent += extractFromParts(part.parts, depth + 1)
    }
    // Extract content from this part
    else if(part.body && part.body.data){
      const mimeType = part.mimeType || 'text/plain'
      const rawContent = Buffer.from(part.body.data, 'base64').toString('utf8')
      const processedContent = processContentByMimeType(rawContent, mimeType)
      
      if(processedContent){
        textContent += processedContent + '\n'
      }
    }
  }
  
  return textContent
}

function processContentByMimeType(content, mimeType){
  try{
    switch(mimeType.toLowerCase()){
      case 'text/plain':
        return content
        
      case 'text/html':
        // Convert HTML to clean text
        return convert(content, {
          wordwrap: false,
          selectors: [
            // Remove common email signatures and footers
            { selector: 'div[class*="signature"]', format: 'skip' },
            { selector: 'div[class*="footer"]', format: 'skip' },
            { selector: '.gmail_signature', format: 'skip' },
            { selector: '.outlook_signature', format: 'skip' },
            // Remove tracking pixels and images
            { selector: 'img[width="1"]', format: 'skip' },
            { selector: 'img[height="1"]', format: 'skip' },
            // Clean up links
            { selector: 'a', options: { ignoreHref: true } },
            // Handle lists properly
            { selector: 'ul', options: { uppercase: false } },
            { selector: 'ol', options: { uppercase: false } }
          ]
        })
        
      default:
        // For other mime types, try to strip HTML tags if present
        return striptags(content)
    }
  }catch(e){
    console.error('processContentByMimeType error:', e.message)
    return striptags(content) // Fallback to simple tag stripping
  }
}

function cleanEmailText(text){
  if(!text) return ''
  
  // Remove excessive whitespace and normalize line breaks
  let cleaned = text
    .replace(/\r\n/g, '\n')           // Normalize line endings
    .replace(/\r/g, '\n')             // Handle old Mac line endings
    .replace(/\n{3,}/g, '\n\n')       // Limit consecutive line breaks to 2
    .replace(/[ \t]{2,}/g, ' ')       // Replace multiple spaces/tabs with single space
    .replace(/^\s+|\s+$/gm, '')       // Trim whitespace from each line
  
  // Remove common email artifacts
  cleaned = cleaned
    .replace(/^>.*$/gm, '')           // Remove quoted text lines
    .replace(/^From:.*$/gim, '')      // Remove forwarded email headers
    .replace(/^To:.*$/gim, '')
    .replace(/^Cc:.*$/gim, '')
    .replace(/^Subject:.*$/gim, '')
    .replace(/^Date:.*$/gim, '')
    .replace(/^Sent:.*$/gim, '')
    .replace(/^Reply-To:.*$/gim, '')
    
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
    
  // Final cleanup
  cleaned = cleaned
    .replace(/\n{3,}/g, '\n\n')       // Again limit line breaks
    .trim()                           // Final trim
    
  // Remove lines that are just punctuation or very short
  const lines = cleaned.split('\n').filter(line => {
    const trimmed = line.trim()
    return trimmed.length > 2 && !/^[^\w]*$/.test(trimmed)
  })
  
  return lines.join('\n')
}

// Test cases
console.log('Testing enhanced extractPlainText function...\n')

// Test 1: HTML email with signature
const htmlEmail = {
  payload: {
    mimeType: 'text/html',
    body: {
      data: Buffer.from(`
        <html>
          <body>
            <p>Hi there,</p>
            <p>This is an <strong>important</strong> meeting reminder for tomorrow at 2 PM.</p>
            <p>Please let me know if you can attend.</p>
            <br>
            <div class="signature">
              <p>--</p>
              <p>John Doe</p>
              <p>Sent from my iPhone</p>
            </div>
          </body>
        </html>
      `).toString('base64')
    }
  }
}

console.log('Test 1 - HTML Email:')
console.log('Result:', extractPlainText(htmlEmail))
console.log('\n' + '='.repeat(50) + '\n')

// Test 2: Plain text with quoted content
const plainEmail = {
  payload: {
    mimeType: 'text/plain',
    body: {
      data: Buffer.from(`
Thanks for the update!

> On Nov 19, 2025, Jane Smith wrote:
> This is the original message content
> that should be filtered out.

Let me know if you need anything else.

--
Best regards,
Alice
Sent from my iPad
      `).toString('base64')
    }
  }
}

console.log('Test 2 - Plain Text with Quotes:')
console.log('Result:', extractPlainText(plainEmail))
console.log('\n' + '='.repeat(50) + '\n')

// Test 3: Multi-part email
const multipartEmail = {
  payload: {
    parts: [
      {
        mimeType: 'text/plain',
        body: {
          data: Buffer.from('This is the plain text part of the email.').toString('base64')
        }
      },
      {
        mimeType: 'text/html',
        body: {
          data: Buffer.from('<p>This is the HTML part with <a href="http://example.com">link</a>.</p>').toString('base64')
        }
      }
    ]
  }
}

console.log('Test 3 - Multipart Email:')
console.log('Result:', extractPlainText(multipartEmail))
