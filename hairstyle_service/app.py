import os
import random
import time
from flask import Flask, request, jsonify, render_template, send_from_directory, url_for
from werkzeug.utils import secure_filename

app = Flask(__name__)

# Config
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
OUTPUT_FOLDER = os.path.join(BASE_DIR, 'outputs')
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['OUTPUT_FOLDER'] = OUTPUT_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB max

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

# Hardcoded hairstyles
HAIRSTYLES = [
    {"id": "short_bob", "name": "Short Bob", "description": "A classic short bob cut."},
    {"id": "long_wavy", "name": "Long Wavy", "description": "Long, flowing wavy hair."},
    {"id": "pixie_cut", "name": "Pixie Cut", "description": "A stylish pixie cut."},
    {"id": "buzz_cut", "name": "Buzz Cut", "description": "A very short buzz cut."}
]

# Mock API Key for paid service
PAID_API_KEY = os.environ.get("HAIRSTYLE_API_KEY", "mock_key_123")

def is_quality_photo(filepath):
    """
    Mock function to check if the uploaded photo is of high quality.
    In a real app, this might involve face detection, blur detection, resolution check, etc.
    """
    # For demonstration, we assume all photos > 10KB are "quality"
    if os.path.getsize(filepath) < 10240:
        return False, "Photo resolution is too low or image is too small. Please upload a high-quality photo."
    return True, ""

def call_paid_api(input_image_path, hairstyle_id):
    """
    Mock integration with a paid API (e.g., Midjourney, Stable Diffusion, or specialized hair API).
    The API should keep the face intact and only change the hair.
    """
    print(f"Calling paid API with key {PAID_API_KEY}...")
    print(f"Instruction: Change hairstyle to {hairstyle_id}, preserve face exactly.")

    # Simulate API latency
    time.sleep(2)

    # In a real app, the API would return a new image.
    # Here, we just copy the input image to the output folder as a mock.
    # We will simulate a generated image by just returning the uploaded one or a placeholder.
    output_filename = f"generated_{os.path.basename(input_image_path)}"
    output_path = os.path.join(app.config['OUTPUT_FOLDER'], output_filename)

    # Mocking generation by copying the original
    with open(input_image_path, 'rb') as f_in:
        with open(output_path, 'wb') as f_out:
            f_out.write(f_in.read())

    return output_filename

@app.route('/')
def index():
    return render_template('index.html', hairstyles=HAIRSTYLES)

@app.route('/generate', methods=['POST'])
def generate():
    if 'photo' not in request.files:
        return jsonify({'error': 'No photo uploaded'}), 400

    file = request.files['photo']
    if file.filename == '':
        return jsonify({'error': 'No selected photo'}), 400

    hairstyle_id = request.form.get('hairstyle')
    if not hairstyle_id or not any(h['id'] == hairstyle_id for h in HAIRSTYLES):
        return jsonify({'error': 'Invalid hairstyle selected'}), 400

    if file:
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)

        # 1. Quality Check
        is_quality, msg = is_quality_photo(filepath)
        if not is_quality:
            os.remove(filepath)
            return jsonify({'error': msg}), 400

        # 2. Call Paid API
        try:
            output_filename = call_paid_api(filepath, hairstyle_id)
            output_url = url_for('get_output', filename=output_filename)
            return jsonify({
                'success': True,
                'result_url': output_url,
                'message': f'Successfully applied {hairstyle_id}!'
            })
        except Exception as e:
            return jsonify({'error': f'API Error: {str(e)}'}), 500

@app.route('/outputs/<filename>')
def get_output(filename):
    return send_from_directory(app.config['OUTPUT_FOLDER'], filename)

if __name__ == '__main__':
    app.run(debug=True, port=5000)
