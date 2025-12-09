document.addEventListener('DOMContentLoaded', () => {
    
    // --- TAB SWITCHING ---
    window.switchTab = function(tabName, btn) {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.view-section').forEach(view => view.classList.remove('active'));
        const target = document.getElementById(`view-${tabName}`);
        if(target) target.classList.add('active');
    };

    // --- UTILS ---
    window.showToast = function(msg) {
        const t = document.getElementById('toast');
        if(t) { t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2000); }
    };

    window.copyText = function(elementId) {
        const el = document.getElementById(elementId);
        if(el) { navigator.clipboard.writeText(el.innerText).then(() => showToast("Copied to Clipboard!")); }
    };

    // --- ADVANCED OPTIONS TOGGLE (CRITICAL FIX) ---
    const btnAdvanced = document.getElementById('btn-advanced-toggle');
    const advancedSection = document.getElementById('advanced-options');
    
    if (btnAdvanced && advancedSection) {
        btnAdvanced.addEventListener('click', (e) => {
            e.preventDefault(); // Stop any unintended form submission
            advancedSection.classList.toggle('hidden');
            btnAdvanced.classList.toggle('open');
        });
    }

    // ==========================================
    // MULTI-FILE UPLOAD LOGIC
    // ==========================================
    const fileInput = document.getElementById('file-input');
    const dropZone = document.getElementById('drop-zone');
    const fileListContainer = document.getElementById('file-list-container');
    const exportInput = document.getElementById('export-filename');
    const previewFilename = document.getElementById('preview-filename');
    const processBtn = document.getElementById('process-btn');

    let uploadedFiles = [];
    let generatedBulkData = null;

    if(dropZone && fileInput) {
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = '#f97316'; dropZone.style.background = '#fff7ed'; });
        dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = '#cbd5e1'; dropZone.style.background = '#f8fafc'; });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = '#cbd5e1'; dropZone.style.background = '#f8fafc';
            if(e.dataTransfer.files.length) { addFiles(e.dataTransfer.files); }
        });
        fileInput.addEventListener('change', () => {
            if(fileInput.files.length) {
                addFiles(fileInput.files);
                fileInput.value = ''; 
            }
        });
    }

    function addFiles(fileList) {
        for(let i=0; i<fileList.length; i++) { uploadedFiles.push(fileList[i]); }
        renderFileList();
        if(uploadedFiles.length > 0 && exportInput && exportInput.value === '') {
            const nameNoExt = uploadedFiles[0].name.split('.').slice(0, -1).join('.');
            exportInput.value = nameNoExt;
            updatePreview();
        }
    }

    window.removeFile = function(index) {
        uploadedFiles.splice(index, 1);
        renderFileList();
    };

    function renderFileList() {
        if(!fileListContainer) return;
        fileListContainer.innerHTML = ''; 
        if(uploadedFiles.length === 0) {
            fileListContainer.classList.add('hidden');
            return;
        }
        fileListContainer.classList.remove('hidden');
        uploadedFiles.forEach((file, index) => {
            const div = document.createElement('div');
            div.className = 'file-item';
            div.innerHTML = `
                <div class="file-info-group"><i class="fa-solid fa-file-csv"></i><span>${file.name}</span></div>
                <button class="remove-file-btn" onclick="removeFile(${index})" title="Remove file"><i class="fa-solid fa-xmark"></i></button>
            `;
            fileListContainer.appendChild(div);
        });
    }

    if(exportInput) exportInput.addEventListener('input', updatePreview);
    function updatePreview() {
        if(previewFilename && exportInput) {
            const val = exportInput.value.trim() || 'output';
            previewFilename.textContent = val + '.json';
        }
    }

    if(processBtn) {
        processBtn.addEventListener('click', async () => {
            if(uploadedFiles.length === 0) return showToast("Please add at least one file!");
            
            const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };

            const settings = {
                datatype: getVal('b-datatype'),
                maxDataSizeMB: getVal('b-maxData'),
                searchableDays: getVal('b-searchDays'),
                splunkArchivalRetentionDays: getVal('b-retention'),
                selfStorageBucketPath: getVal('b-bucket'),
                homePath: getVal('b-homePath'),
                coldPath: getVal('b-coldPath'),
                thawedPath: getVal('b-thawedPath'),
                maxWarmDBCount: getVal('b-maxWarmDB')
            };

            let combinedIndexes = [];

            const readFile = (file) => {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const data = e.target.result;
                        let fileIndexes = [];
                        if(file.name.endsWith('.csv')) {
                            const lines = data.split('\n');
                            const headers = lines[0].split(',').map(h=>h.trim());
                            lines.slice(1).forEach(line => {
                                if(!line.trim()) return;
                                const vals = line.split(',');
                                let obj = { name: vals[0] };
                                headers.forEach((h, i) => { if(i>0 && vals[i]) obj[h.trim()] = isNaN(vals[i]) ? vals[i].trim() : Number(vals[i]); });
                                Object.keys(settings).forEach(k => { if(settings[k] !== "" && !obj[k]) obj[k] = isNaN(settings[k]) ? settings[k] : Number(settings[k]); });
                                fileIndexes.push(obj);
                            });
                        } else {
                            if(typeof XLSX === 'undefined') { alert("XLSX lib missing"); return resolve([]); }
                            const workbook = XLSX.read(new Uint8Array(data), {type:'array'});
                            const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
                            fileIndexes = json.map(row => {
                                Object.keys(settings).forEach(k => { if(settings[k] !== "" && !row[k]) row[k] = isNaN(settings[k]) ? settings[k] : Number(settings[k]); });
                                return row;
                            });
                        }
                        resolve(fileIndexes);
                    };
                    reader.onerror = reject;
                    if(file.name.endsWith('.csv')) reader.readAsText(file); else reader.readAsArrayBuffer(file);
                });
            };

            try {
                const results = await Promise.all(uploadedFiles.map(file => readFile(file)));
                combinedIndexes = results.flat();
                generatedBulkData = JSON.stringify(combinedIndexes, null, 2);
                
                const outputEl = document.getElementById('bulk-output');
                const resultBox = document.getElementById('bulk-result');
                if(outputEl) outputEl.textContent = generatedBulkData;
                if(resultBox) resultBox.classList.remove('hidden');
                
                showToast(`Generated config for ${combinedIndexes.length} indexes!`);
            } catch (err) { console.error(err); alert("Error reading files."); }
        });
    }

    const btnCopy = document.getElementById('btn-copy-json');
    if(btnCopy) {
        btnCopy.addEventListener('click', () => {
            if(!generatedBulkData) return showToast("Generate configuration first!");
            navigator.clipboard.writeText(generatedBulkData).then(() => showToast("JSON Copied to Clipboard!"));
        });
    }

    const btnDownload = document.getElementById('btn-download-json');
    if(btnDownload) {
        btnDownload.addEventListener('click', () => {
            if(!generatedBulkData) return showToast("Generate configuration first!");
            const blob = new Blob([generatedBulkData], {type: 'application/json'});
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            let fname = exportInput.value.trim() || 'output';
            if(!fname.endsWith('.json')) fname += '.json';
            link.download = fname;
            link.click();
            showToast("Download Started");
        });
    }

    // ==========================================
    // APP 2: CURL GENERATOR
    // ==========================================
    window.toggleAuth = function() {
        const type = document.getElementById('c-auth').value;
        const basic = document.getElementById('auth-basic');
        const token = document.getElementById('auth-token');
        
        if(basic) basic.classList.add('hidden');
        if(token) token.classList.add('hidden');
        
        if(type === 'basic' && basic) basic.classList.remove('hidden');
        if(type === 'token' && token) token.classList.remove('hidden');
    };

    window.generateCurl = function() {
        const method = document.getElementById('c-method').value;
        let url = document.getElementById('c-url').value.replace(/\/$/, "");
        
        const includePort = document.getElementById('c-includePort').checked;
        if(includePort && !url.includes(':8089')) { url = url + ":8089"; }

        const auth = document.getElementById('c-auth').value;
        const endpoint = document.getElementById('c-endpoint').value;
        let cmd = `curl -k -X ${method} "${url}/services/${endpoint}"`;
        if(auth === 'basic') {
            const u = document.getElementById('c-user').value;
            const p = document.getElementById('c-pass').value;
            cmd += ` -u ${u}:${p}`;
        } else if (auth === 'token') {
            const t = document.getElementById('c-token').value;
            cmd += ` -H 'Authorization: Bearer ${t}'`;
        }
        document.getElementById('curl-output').textContent = cmd;
        document.getElementById('curl-result').classList.remove('hidden');
    };

    // --- CRITICAL FIX: Run on load to set initial state ---
    window.toggleAuth();
});