// PDF.jsの設定
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

class PDFMerger {
  constructor() {
    this.pages = [];
    this.sortable = null;
    this.initializeElements();
    this.setupEventListeners();
  }

  initializeElements() {
    this.dropZone = document.getElementById('dropZone');
    this.fileInput = document.getElementById('fileInput');
    this.controls = document.getElementById('controls');
    this.pagesGrid = document.getElementById('pagesGrid');
    this.clearBtn = document.getElementById('clearBtn');
    this.mergeBtn = document.getElementById('mergeBtn');
    this.pageCount = document.getElementById('pageCount');
    this.loading = document.getElementById('loading');
  }

  setupEventListeners() {
    // ドラッグ&ドロップイベント
    this.dropZone.addEventListener('dragover', this.handleDragOver.bind(this));
    this.dropZone.addEventListener('dragleave', this.handleDragLeave.bind(this));
    this.dropZone.addEventListener('drop', this.handleDrop.bind(this));
    this.dropZone.addEventListener('click', () => this.fileInput.click());

    // ファイル選択イベント
    this.fileInput.addEventListener('change', this.handleFileSelect.bind(this));

    // ボタンイベント
    this.clearBtn.addEventListener('click', this.clearPages.bind(this));
    this.mergeBtn.addEventListener('click', this.mergePDFs.bind(this));

    // ファイル選択テキストのクリックイベント
    document.querySelector('.file-select').addEventListener('click', (e) => {
      e.stopPropagation();
      this.fileInput.click();
    });
  }

  handleDragOver(e) {
    e.preventDefault();
    this.dropZone.classList.add('dragover');
  }

  handleDragLeave(e) {
    e.preventDefault();
    this.dropZone.classList.remove('dragover');
  }

  handleDrop(e) {
    e.preventDefault();
    this.dropZone.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files).filter(file => file.type === 'application/pdf');
    if (files.length > 0) {
      this.processFiles(files);
    }
  }

  handleFileSelect(e) {
    const files = Array.from(e.target.files).filter(file => file.type === 'application/pdf');
    if (files.length > 0) {
      this.processFiles(files);
    }
  }

  async processFiles(files) {
    this.showLoading();

    try {
      for (const file of files) {
        await this.processPDF(file);
      }
      this.updateUI();
      this.setupSortable();
    } catch (error) {
      console.error('ファイル処理エラー:', error);
      alert('PDFファイルの処理中にエラーが発生しました。');
    } finally {
      this.hideLoading();
    }
  }

  async processPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      const viewport = page.getViewport({ scale: 0.5 });
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;

      const thumbnail = canvas.toDataURL();

      this.pages.push({
        id: Date.now() + Math.random(),
        fileName: file.name,
        pageNumber: pageNum,
        totalPages: pdf.numPages,
        thumbnail: thumbnail,
        pdfData: arrayBuffer,
        pageIndex: pageNum - 1
      });
    }
  }

  updateUI() {
    this.controls.style.display = this.pages.length > 0 ? 'flex' : 'none';
    this.pageCount.textContent = `${this.pages.length}ページ`;
    this.renderPages();
  }

  renderPages() {
    this.pagesGrid.innerHTML = '';

    this.pages.forEach((page, index) => {
      const pageElement = document.createElement('div');
      pageElement.className = 'page-item';
      pageElement.dataset.id = page.id;

      pageElement.innerHTML = `
                <button class="delete-btn" onclick="pdfMerger.deletePage('${page.id}')">×</button>
                <img src="${page.thumbnail}" alt="Page ${page.pageNumber}" class="page-thumbnail">
                <div class="page-info">${page.fileName}</div>
                <div class="page-number">ページ ${page.pageNumber}/${page.totalPages}</div>
            `;

      this.pagesGrid.appendChild(pageElement);
    });
  }

  setupSortable() {
    if (this.sortable) {
      this.sortable.destroy();
    }

    this.sortable = Sortable.create(this.pagesGrid, {
      animation: 150,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      onEnd: (evt) => {
        const oldIndex = evt.oldIndex;
        const newIndex = evt.newIndex;

        // 配列の順序を更新
        const movedPage = this.pages.splice(oldIndex, 1)[0];
        this.pages.splice(newIndex, 0, movedPage);
      }
    });
  }

  deletePage(pageId) {
    this.pages = this.pages.filter(page => page.id !== pageId);
    this.updateUI();
    if (this.pages.length > 0) {
      this.setupSortable();
    }
  }

  clearPages() {
    this.pages = [];
    this.updateUI();
    if (this.sortable) {
      this.sortable.destroy();
      this.sortable = null;
    }
  }

  async mergePDFs() {
    if (this.pages.length === 0) {
      alert('結合するページがありません。');
      return;
    }

    this.showLoading();

    try {
      // PDF-libが正しく読み込まれているかチェック
      if (typeof PDFLib === 'undefined') {
        throw new Error('PDF-libライブラリが読み込まれていません。');
      }

      const mergedPdf = await PDFLib.PDFDocument.create();
      const processedPDFs = new Map();

      for (const page of this.pages) {
        try {
          let sourcePdf;

          if (processedPDFs.has(page.fileName)) {
            sourcePdf = processedPDFs.get(page.fileName);
          } else {
            // ArrayBufferが有効かチェック
            if (!page.pdfData || page.pdfData.byteLength === 0) {
              throw new Error(`${page.fileName}のデータが無効です。`);
            }

            sourcePdf = await PDFLib.PDFDocument.load(page.pdfData);
            processedPDFs.set(page.fileName, sourcePdf);
          }

          // ページインデックスが有効かチェック
          const pageCount = sourcePdf.getPageCount();
          if (page.pageIndex >= pageCount || page.pageIndex < 0) {
            throw new Error(`${page.fileName}のページ${page.pageNumber}が見つかりません。`);
          }

          const [copiedPage] = await mergedPdf.copyPages(sourcePdf, [page.pageIndex]);
          mergedPdf.addPage(copiedPage);

        } catch (pageError) {
          console.error(`ページ処理エラー (${page.fileName}, ページ${page.pageNumber}):`, pageError);
          throw new Error(`${page.fileName}のページ${page.pageNumber}の処理中にエラーが発生しました: ${pageError.message}`);
        }
      }

      console.log('PDF結合開始...');
      const pdfBytes = await mergedPdf.save();
      console.log('PDF結合完了、ダウンロード開始...');

      this.downloadPDF(pdfBytes, 'merged.pdf');

    } catch (error) {
      console.error('PDF結合エラー:', error);
      alert(`PDF結合中にエラーが発生しました:\n${error.message}`);
    } finally {
      this.hideLoading();
    }
  }

  downloadPDF(pdfBytes, filename) {
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  showLoading() {
    this.loading.style.display = 'flex';
  }

  hideLoading() {
    this.loading.style.display = 'none';
  }
}

// アプリケーション初期化
let pdfMerger;
document.addEventListener('DOMContentLoaded', () => {
  pdfMerger = new PDFMerger();
});
