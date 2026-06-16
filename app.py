import os
import re
import requests
import time
from bs4 import BeautifulSoup
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

# In-memory cache to prevent hitting Google's feed on every page reload
cache = {
    "data": None,
    "last_fetched": 0
}
CACHE_DURATION = 300  # 5 minutes

def parse_release_notes(xml_content):
    soup = BeautifulSoup(xml_content, 'xml')
    entries = soup.find_all('entry')
    updates = []
    
    for entry in entries:
        # Extract title (which contains the date, e.g., "June 15, 2026")
        date_str = entry.title.text.strip() if entry.title else "Unknown Date"
        
        # Extract updated timestamp
        updated_str = entry.updated.text.strip() if entry.updated else ""
        
        # Extract alternate link
        link_tag = entry.find('link', rel='alternate')
        link_str = link_tag['href'] if link_tag and 'href' in link_tag.attrs else ""
        
        # Extract entry id
        entry_id = entry.id.text.strip() if entry.id else ""
        
        # Parse description content HTML
        content_html = entry.content.text if entry.content else ""
        if not content_html:
            continue
            
        content_soup = BeautifulSoup(content_html, 'html.parser')
        h3_tags = content_soup.find_all('h3')
        
        if not h3_tags:
            # Treat the whole content as one update
            desc_text = re.sub(r'\s+', ' ', content_soup.get_text()).strip()
            updates.append({
                "id": f"{entry_id}-0",
                "date": date_str,
                "isoDate": updated_str,
                "link": link_str,
                "type": "Update",
                "html": str(content_soup),
                "text": desc_text
            })
        else:
            for idx, h3 in enumerate(h3_tags):
                update_type = h3.text.strip()
                
                # Gather siblings until next h3
                description_elements = []
                curr = h3.next_sibling
                while curr and curr.name != 'h3':
                    description_elements.append(curr)
                    curr = curr.next_sibling
                
                # Create HTML string for the description
                desc_html = "".join(str(el) for el in description_elements).strip()
                
                # Create clean plain text version (for searching & tweeting)
                desc_text = "".join(el.get_text() if hasattr(el, 'get_text') else str(el) for el in description_elements).strip()
                desc_text = re.sub(r'\s+', ' ', desc_text)
                
                updates.append({
                    "id": f"{entry_id}-{idx}",
                    "date": date_str,
                    "isoDate": updated_str,
                    "link": link_str + (f"#{date_str.replace(' ', '_')}" if date_str else ""),
                    "type": update_type,
                    "html": desc_html,
                    "text": desc_text
                })
                
    return updates

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/releases')
def get_releases():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    now = time.time()
    
    if force_refresh or not cache["data"] or (now - cache["last_fetched"] > CACHE_DURATION):
        try:
            # Add user-agent header to look like a standard browser request
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
            response = requests.get(FEED_URL, headers=headers, timeout=15)
            response.raise_for_status()
            
            parsed_data = parse_release_notes(response.content)
            cache["data"] = parsed_data
            cache["last_fetched"] = now
            return jsonify({
                "status": "success",
                "source": "network",
                "fetched_at": time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(now)),
                "releases": parsed_data
            })
        except Exception as e:
            # Fallback to cache if available
            if cache["data"]:
                return jsonify({
                    "status": "partial_success",
                    "source": "cache_fallback",
                    "error": str(e),
                    "fetched_at": time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(cache["last_fetched"])),
                    "releases": cache["data"]
                })
            return jsonify({
                "status": "error",
                "error": str(e),
                "releases": []
            }), 500
            
    return jsonify({
        "status": "success",
        "source": "cache",
        "fetched_at": time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(cache["last_fetched"])),
        "releases": cache["data"]
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)
