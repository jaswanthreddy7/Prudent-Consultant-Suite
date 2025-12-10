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

    // --- ADVANCED OPTIONS TOGGLE ---
    const btnAdvanced = document.getElementById('btn-advanced-toggle');
    const advancedSection = document.getElementById('advanced-options');
    if (btnAdvanced && advancedSection) {
        btnAdvanced.addEventListener('click', (e) => {
            e.preventDefault();
            advancedSection.classList.toggle('hidden');
            btnAdvanced.classList.toggle('open');
        });
    }

    // ==========================================
    // TEMPLATE LOGIC
    // ==========================================
    window.updateTemplateLink = function() {
        const opType = document.getElementById('b-operation-type').value;
        const descDiv = document.getElementById('op-description');
        const advWrapper = document.getElementById('index-advanced-wrapper');

        if(opType === 'indexes') {
            advWrapper.classList.remove('hidden');
            descDiv.innerHTML = "Generate <code>indexes.conf</code> stanzas. Upload CSV/Excel with: Index Name, Datatype, Retention, etc.";
        } else {
            advWrapper.classList.add('hidden');
            if(opType === 'splunkbase') descDiv.innerHTML = "Bulk install Splunkbase apps. Upload with: <b>AppID</b>, <b>Version</b> (optional).";
            if(opType === 'private_apps') descDiv.innerHTML = "Bulk install Private apps. Upload with: <b>PackagePath</b> (URL or local path).";
            if(opType === 'hec_tokens') descDiv.innerHTML = "Bulk create HEC Tokens. Upload with: <b>Name</b>, <b>Index</b>, <b>Source</b>.";
            if(opType === 'ip_allowlist') descDiv.innerHTML = "Manage IP Allowlists. Upload with: <b>Feature</b> (e.g. search-api), <b>Subnets</b>.";
            if(opType === 'outbound_ports') descDiv.innerHTML = "Configure Outbound Ports. Upload with: <b>Port</b>, <b>Subnets</b>.";
            if(opType === 'maintenance_windows') descDiv.innerHTML = "Schedule Maintenance. Upload with: <b>Start (ISO)</b>, <b>Duration</b>.";
        }
    };

    function getTemplateData() {
        const opType = document.getElementById('b-operation-type').value;
        if(opType === 'indexes') return [["Index Name", "Datatype", "Max Data Size (MB)", "Searchable Days", "Retention Days", "Self Storage Bucket"], ["sales_logs", "Events", "500", "30", "365", "your-bucket/sales"], ["app_metrics", "Metrics", "100", "7", "90", "your-bucket/metrics"]];
        if(opType === 'splunkbase') return [["AppID", "Version"], ["1234", "1.0.0"], ["5678", ""]];
        if(opType === 'private_apps') return [["PackagePath"], ["http://example.com/app.tgz"], ["/tmp/my_app.tar.gz"]];
        if(opType === 'hec_tokens') return [["Name", "Index", "Source", "SourceType"], ["my-hec-token", "main", "http:app", "json"]];
        if(opType === 'ip_allowlist') return [["Feature", "Subnets"], ["search-api", "1.2.3.4/32"], ["hec-api", "10.0.0.0/24"]];
        if(opType === 'outbound_ports') return [["Port", "Subnets"], ["8088", "192.168.1.0/24"], ["443", "10.0.0.5/32"]];
        if(opType === 'maintenance_windows') return [["Start Time", "Duration (Mins)"], ["2025-10-01T02:00:00Z", "60"], ["2025-11-01T04:00:00Z", "30"]];
        return [];
    }

    function downloadTemplate(format) {
        const data = getTemplateData();
        const opType = document.getElementById('b-operation-type').value;
        const filename = `template_${opType}.${format}`;

        if (format === 'csv') {
            const csvContent = "data:text/csv;charset=utf-8," + data.map(e => e.join(",")).join("\n");
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", filename);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else {
            if(typeof XLSX === 'undefined') { alert('XLSX library not loaded. Check internet connection.'); return; }
            const ws = XLSX.utils.aoa_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Template");
            XLSX.writeFile(wb, filename);
        }
        showToast(`${format.toUpperCase()} Template Downloaded`);
    }

    const btnCsv = document.getElementById('btn-download-csv');
    const btnXlsx = document.getElementById('btn-download-xlsx');
    if(btnCsv) btnCsv.addEventListener('click', (e) => { e.preventDefault(); downloadTemplate('csv'); });
    if(btnXlsx) btnXlsx.addEventListener('click', (e) => { e.preventDefault(); downloadTemplate('xlsx'); });

    // ==========================================
    // BULK PROCESSOR ENGINE
    // ==========================================
    const fileInput = document.getElementById('file-input');
    const dropZone = document.getElementById('drop-zone');
    const fileListContainer = document.getElementById('file-list-container');
    const exportInput = document.getElementById('export-filename');
    const previewFilename = document.getElementById('preview-filename');
    const processBtn = document.getElementById('process-btn');

    let uploadedFiles = [];
    let generatedOutput = null;

    if(dropZone && fileInput) {
        dropZone.addEventListener('click', (e) => { if(!e.target.closest('.sample-link')) fileInput.click(); });
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = '#f97316'; dropZone.style.background = 'rgba(249, 115, 22, 0.1)'; });
        dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.style.borderColor = 'rgba(255,255,255,0.1)'; dropZone.style.background = 'rgba(255,255,255,0.02)'; });
        dropZone.addEventListener('drop', (e) => { e.preventDefault(); if(e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });
        fileInput.addEventListener('change', () => { if(fileInput.files.length) { addFiles(fileInput.files); fileInput.value = ''; } });
    }

    function addFiles(fileList) {
        for(let i=0; i<fileList.length; i++) uploadedFiles.push(fileList[i]);
        renderFileList();
        if(uploadedFiles.length > 0 && exportInput && exportInput.value === '') {
            const name = uploadedFiles[0].name;
            exportInput.value = name.split('.').slice(0, -1).join('.');
            updatePreview();
        }
    }

    window.removeFile = function(index) { uploadedFiles.splice(index, 1); renderFileList(); };

    function renderFileList() {
        if(!fileListContainer) return;
        fileListContainer.innerHTML = '';
        if(uploadedFiles.length === 0) { fileListContainer.classList.add('hidden'); return; }
        fileListContainer.classList.remove('hidden');
        uploadedFiles.forEach((file, index) => {
            const div = document.createElement('div');
            div.className = 'file-item';
            div.innerHTML = `<div class="file-info-group"><i class="fa-solid fa-file-csv"></i><span>${file.name}</span></div><button class="remove-file-btn" onclick="removeFile(${index})"><i class="fa-solid fa-xmark"></i></button>`;
            fileListContainer.appendChild(div);
        });
    }

    if(exportInput) exportInput.addEventListener('input', updatePreview);
    function updatePreview() { if(previewFilename) previewFilename.textContent = (exportInput.value.trim() || 'output') + '.json'; }

    if(processBtn) {
        processBtn.addEventListener('click', async () => {
            if(uploadedFiles.length === 0) return showToast("Please upload a file first!");
            const opType = document.getElementById('b-operation-type').value;
            let finalData = [];

            const readFile = (file) => new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const data = e.target.result;
                    let rows = [];
                    if(file.name.endsWith('.csv')) {
                        const lines = data.split('\n').filter(l => l.trim());
                        const headers = lines[0].split(',').map(h => h.trim());
                        lines.slice(1).forEach(line => {
                            const vals = line.split(',');
                            let obj = {};
                            headers.forEach((h, i) => obj[h] = vals[i] ? vals[i].trim() : "");
                            rows.push(obj);
                        });
                    } else if(typeof XLSX !== 'undefined') {
                        const workbook = XLSX.read(new Uint8Array(data), {type:'array'});
                        rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
                    }
                    resolve(rows);
                };
                if(file.name.endsWith('.csv')) reader.readAsText(file); else reader.readAsArrayBuffer(file);
            });

            const allRowsArray = await Promise.all(uploadedFiles.map(f => readFile(f)));
            const flatRows = allRowsArray.flat();

            if(opType === 'indexes') {
                const getVal = (id) => document.getElementById(id) ? document.getElementById(id).value : '';
                const settings = {
                    datatype: getVal('b-datatype'), maxDataSizeMB: getVal('b-maxData'), searchableDays: getVal('b-searchDays'),
                    splunkArchivalRetentionDays: getVal('b-retention'), selfStorageBucketPath: getVal('b-bucket'),
                    homePath: getVal('b-homePath'), coldPath: getVal('b-coldPath'), thawedPath: getVal('b-thawedPath')
                };
                finalData = flatRows.map(row => {
                    Object.keys(settings).forEach(k => { if(settings[k] && !row[k]) row[k] = settings[k]; });
                    return row;
                });
            } 
            else if (opType === 'splunkbase') { finalData = { "apps": flatRows.map(r => ({ "splunkbaseID": r["AppID"] || r["id"], "version": r["Version"] })) }; }
            else if (opType === 'private_apps') { finalData = { "apps": flatRows.map(r => ({ "appPackage": r["PackagePath"] || r["path"] })) }; }
            else if (opType === 'hec_tokens') { finalData = flatRows.map(r => ({ "name": r["Name"], "index": r["Index"], "source": r["Source"], "sourcetype": r["SourceType"] })); }
            else if (opType === 'ip_allowlist') { finalData = flatRows.map(r => ({ "feature": r["Feature"], "subnets": r["Subnets"] ? r["Subnets"].split(';') : [] })); }
            else if (opType === 'outbound_ports') { finalData = flatRows.map(r => ({ "port": r["Port"], "subnets": r["Subnets"] ? r["Subnets"].split(';') : [] })); }
            else if (opType === 'maintenance_windows') { finalData = flatRows.map(r => ({ "start": r["Start Time"], "duration": r["Duration (Mins)"] })); }

            generatedOutput = JSON.stringify(finalData, null, 4);
            document.getElementById('bulk-output').textContent = generatedOutput;
            document.getElementById('bulk-result').classList.remove('hidden');
            showToast("JSON Generated Successfully!");
        });
    }

    const btnCopy = document.getElementById('btn-copy-json');
    if(btnCopy) btnCopy.addEventListener('click', () => { if(!generatedOutput) return showToast("Generate first!"); navigator.clipboard.writeText(generatedOutput).then(() => showToast("Copied!")); });
    const btnDownload = document.getElementById('btn-download-json');
    if(btnDownload) btnDownload.addEventListener('click', () => { if(!generatedOutput) return showToast("Generate first!"); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([generatedOutput], {type: 'application/json'})); link.download = (document.getElementById('export-filename').value.trim() || 'output') + '.json'; link.click(); });

    // ==========================================
    // CURL GENERATOR
    // ==========================================
    window.toggleAuth = function() {
        const type = document.getElementById('c-auth').value;
        const basic = document.getElementById('auth-basic');
        const token = document.getElementById('auth-token');
        if(basic) basic.classList.toggle('hidden', type !== 'basic');
        if(token) token.classList.toggle('hidden', type !== 'token');
    };

    window.generateCurl = function() {
        const method = document.getElementById('c-method').value;
        let url = document.getElementById('c-url').value.replace(/\/$/, "");
        if(document.getElementById('c-includePort').checked && !url.includes(':8089')) url += ":8089";
        
        const endpointSelect = document.getElementById('c-endpoint');
        const selectedOption = endpointSelect.options[endpointSelect.selectedIndex];
        const apiPath = selectedOption.getAttribute('data-path') || "services";
        const endpoint = endpointSelect.value;

        let cmd = `curl -k -X ${method} "${url}/${apiPath}/${endpoint}"`;
        const auth = document.getElementById('c-auth').value;
        if(auth === 'basic') cmd += ` -u ${document.getElementById('c-user').value}:${document.getElementById('c-pass').value}`;
        else if (auth === 'token') cmd += ` -H 'Authorization: Bearer ${document.getElementById('c-token').value}'`;
        
        document.getElementById('curl-output').textContent = cmd;
        document.getElementById('curl-result').classList.remove('hidden');
    };

    window.updateTemplateLink();
    window.toggleAuth();
});
