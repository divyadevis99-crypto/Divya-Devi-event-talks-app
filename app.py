import re
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
import html
from flask import Flask, render_template, jsonify

app = Flask(__name__)

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

def strip_html_tags(html_str):
    """Converts HTML release note content into a clean plain text format for tweeting."""
    if not html_str:
        return ""
    
    # Format code blocks with backticks
    text = re.sub(r'<code>(.*?)</code>', r'`\1`', html_str)
    # Format bold text with asterisks
    text = re.sub(r'<strong>(.*?)</strong>', r'*\1*', text)
    text = re.sub(r'<b>(.*?)</b>', r'*\1*', text)
    
    # Format hyperlinks: <a href="url">text</a> -> text (url)
    def repl_link(match):
        url = match.group(1)
        link_text = match.group(2)
        if url.startswith('http'):
            return f"{link_text} ({url})"
        elif url.startswith('/'):
            return f"{link_text} (https://cloud.google.com{url})"
        return link_text
        
    text = re.sub(r'<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>(.*?)</a>', repl_link, text)
    # Strip any other remaining HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    # Decode HTML entities like &amp;, &lt;, etc.
    text = html.unescape(text)
    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def parse_release_notes(xml_data):
    """Parses BigQuery release notes Atom feed and splits daily entries into individual updates."""
    root = ET.fromstring(xml_data)
    
    # Atom Namespace mapping
    ns = {'atom': 'http://www.w3.org/2005/Atom'}
    
    updates = []
    update_counter = 0
    
    for entry in root.findall('atom:entry', ns):
        # The title contains the date string (e.g., "June 15, 2026")
        entry_title = entry.find('atom:title', ns)
        date_str = entry_title.text.strip() if entry_title is not None else "Unknown Date"
        
        # The updated tag contains ISO format date
        entry_updated = entry.find('atom:updated', ns)
        iso_date = entry_updated.text.strip() if entry_updated is not None else ""
        # Keep only date part if possible (YYYY-MM-DD)
        if len(iso_date) >= 10:
            iso_date = iso_date[:10]
            
        # The link tag contains the alternate web URL
        link_elem = entry.find('atom:link[@rel="alternate"]', ns)
        if link_elem is None:
            link_elem = entry.find('atom:link', ns)
        alternate_url = link_elem.attrib.get('href', '').strip() if link_elem is not None else ""
        
        # The content contains the HTML body
        content_elem = entry.find('atom:content', ns)
        if content_elem is None or not content_elem.text:
            continue
            
        html_content = content_elem.text
        
        # Split the content by <h3> headers to get individual updates
        parts = re.split(r'<h3>(.*?)</h3>', html_content)
        
        if len(parts) > 1:
            # The first part is text before the first <h3> (usually empty or whitespace)
            # We loop in pairs: (Type, Content)
            for i in range(1, len(parts), 2):
                update_type = parts[i].strip()
                update_html = parts[i+1].strip() if i+1 < len(parts) else ""
                
                plain_text = strip_html_tags(update_html)
                
                # Truncate preview for plain text
                preview_text = plain_text
                if len(preview_text) > 180:
                    preview_text = preview_text[:177] + "..."
                
                # Unique ID for each sub-update
                update_id = f"bq-{iso_date}-{update_counter}"
                update_counter += 1
                
                updates.append({
                    "id": update_id,
                    "date": date_str,
                    "iso_date": iso_date,
                    "type": update_type,
                    "content_html": update_html,
                    "plain_text": plain_text,
                    "preview_text": preview_text,
                    "url": alternate_url
                })
        else:
            # Single entry without <h3> tags
            plain_text = strip_html_tags(html_content)
            preview_text = plain_text
            if len(preview_text) > 180:
                preview_text = preview_text[:177] + "..."
                
            update_id = f"bq-{iso_date}-{update_counter}"
            update_counter += 1
            
            updates.append({
                "id": update_id,
                "date": date_str,
                "iso_date": iso_date,
                "type": "Update",
                "content_html": html_content,
                "plain_text": plain_text,
                "preview_text": preview_text,
                "url": alternate_url
            })
            
    return updates

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/release-notes')
def get_release_notes():
    try:
        # Fetch the feed
        req = urllib.request.Request(
            FEED_URL, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        )
        with urllib.request.urlopen(req) as response:
            xml_data = response.read()
            
        updates = parse_release_notes(xml_data)
        return jsonify({
            "status": "success",
            "count": len(updates),
            "updates": updates
        })
    except urllib.error.URLError as e:
        return jsonify({
            "status": "error",
            "message": f"Network Error: Unable to fetch release notes from Google Cloud. {str(e)}"
        }), 502
    except ET.ParseError as e:
        return jsonify({
            "status": "error",
            "message": f"Parsing Error: The fetched XML is invalid or corrupted. {str(e)}"
        }), 500
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Unexpected error: {str(e)}"
        }), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
