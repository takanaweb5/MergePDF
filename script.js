// PDF.jsの設定
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

class PDFMerger {
  constructor() {
    this.pages = [];
    this.counter = 1;
    this.sortable = null;
    this.currentPreviewIndex = -1; // 初期値を-1（未選択状態）に設定

    function handlePreviewKeyDown(event) {
      switch (event.key) {
        case 'Escape':
          this.closePreview();
          break;
        case 'ArrowLeft':
          if (this.currentPreviewIndex > 0) {
            this.drawImage(this.currentPreviewIndex - 1);
          }
          break;
        case 'ArrowRight':
          if (this.currentPreviewIndex < this.pages.length - 1) {
            this.drawImage(this.currentPreviewIndex + 1);
          }
          break;
      }
    }
    this.handlePreviewKeyDown = handlePreviewKeyDown.bind(this);

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

    // モーダル関連の要素
    this.previewModal = document.getElementById('previewModal');
    this.closeModalBtn = document.getElementById('closeModalBtn');
    this.previewImage = document.getElementById('previewImage');
  }

  setupEventListeners() {
    // 既存のイベントリスナー設定
    this.dropZone.addEventListener('dragover', this.handleDragOver.bind(this));
    this.dropZone.addEventListener('dragleave', this.handleDragLeave.bind(this));
    this.dropZone.addEventListener('drop', this.handleDrop.bind(this));
    this.dropZone.addEventListener('click', () => this.fileInput.click());
    this.fileInput.addEventListener('change', this.handleFileSelect.bind(this));
    this.clearBtn.addEventListener('click', this.clearPages.bind(this));
    this.mergeBtn.addEventListener('click', this.mergePDFs.bind(this));
    this.closeModalBtn.addEventListener('click', this.closePreview.bind(this));

    // 前のページへボタン
    document.getElementById('prevPageBtn').addEventListener('click', () => {
      this.drawImage(this.currentPreviewIndex - 1);
    });

    // 次のページへボタン
    document.getElementById('nextPageBtn').addEventListener('click', () => {
      this.drawImage(this.currentPreviewIndex + 1);
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
      await Promise.all(files.map(file => this.processPDF(file)));
      this.updateUI();
      this.setupSortable();
    } catch (error) {
      console.error('ファイル処理エラー:', error);
      alert('PDFファイルの処理中にエラーが発生しました。');
    } finally {
      this.hideLoading();
    }
  }

  /**
   * PDFページをキャンバスにレンダリングし、DataURLを返す
   * @param {Object} page - PDFページオブジェクト
   * @param {number} [scale] - 拡大率
   * @param {number} [rotation] - 回転角度（度）
   * @returns {Promise<string>} レンダリングされた画像のDataURL
   */
  async renderPdfPageToDataURL(page, scale, rotation = 0) {
    // キャンバスの作成
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    // ビューポートの取得と回転適用
    const viewport = page.getViewport({ scale, rotation });

    // キャンバスサイズの設定
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    // レンダリング
    await page.render({
      canvasContext: context,
      viewport: viewport,
      intent: 'display',
      enableWebGL: true,
      renderInteractiveForms: false
    }).promise;

    return canvas.toDataURL();
  }

  async processPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    // ディープコピーを実行(非同期処理の不具合対策)
    const pdfData = arrayBuffer.slice(0);

    // PDF.js用にUint8Arrayを作成
    const pdf = await pdfjsLib.getDocument(new Uint8Array(arrayBuffer)).promise;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const thumbnail = await this.renderPdfPageToDataURL(page, 0.5);
      this.pages.push({
        id: this.counter++,
        fileName: file.name, // PDFファイル名
        pageNumber: pageNum, // PDFファイル内のページ番号
        totalPages: pdf.numPages, // PDFファイル内の総ページ数
        thumbnail: thumbnail, // サムネイル画像(data:image/png)
        pdfData: pdfData,  // PDFファイル全体のバイナリデータ(1ページ分ではない)
        rotation: 0 // 回転角度を0°で初期化
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

    this.pages.forEach((page) => {
      const pageElement = document.createElement('div');
      pageElement.className = 'page-item';
      pageElement.dataset.id = page.id;

      // 削除ボタン
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-btn';
      deleteBtn.textContent = '×';
      deleteBtn.onclick = (e) => {
        e.stopPropagation(); // イベントの伝播を止める
        this.deletePage(page.id);
      };

      // サムネイルコンテナ
      const thumbnailContainer = document.createElement('div');
      thumbnailContainer.className = 'thumbnail-container';

      // サムネイル
      const thumbnail = document.createElement('img');
      thumbnail.src = page.thumbnail;
      thumbnail.alt = `Page ${page.pageNumber}`;
      thumbnail.className = 'page-thumbnail';
      thumbnail.style.transform = `rotate(${page.rotation}deg)`;

      // サムネイルクリック時のプレビュー表示
      thumbnailContainer.addEventListener('click', () => {
        this.showPreview(this.pages.indexOf(page));
      });
      thumbnailContainer.appendChild(thumbnail);

      // 回転ボタン
      const rotateBtn = document.createElement('button');
      rotateBtn.className = 'rotate-btn';
      rotateBtn.title = '90°回転';
      rotateBtn.innerHTML = '↻';
      rotateBtn.onclick = (e) => {
        e.stopPropagation();
        this.rotatePage(page.id, 90);
      };
      thumbnailContainer.appendChild(rotateBtn);

      pageElement.appendChild(deleteBtn);
      pageElement.appendChild(thumbnailContainer);

      // ファイル情報
      const pageInfo = document.createElement('div');
      pageInfo.className = 'page-info';
      pageInfo.textContent = page.fileName;

      // ページ番号
      const pageNumber = document.createElement('div');
      pageNumber.className = 'page-number';
      pageNumber.textContent = `ページ ${page.pageNumber}/${page.totalPages}`;

      // 要素を追加
      pageElement.appendChild(pageInfo);
      pageElement.appendChild(pageNumber);

      this.pagesGrid.appendChild(pageElement);
    });

    this.setupSortable();
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

  async rotatePage(pageId, degrees) {
    const page = this.pages.find(p => p.id === pageId);
    if (page) {
      // 回転角度を更新（0, 90, 180, 270度に制限）
      page.rotation = (page.rotation + degrees) % 360;

      // サムネイル一覧を再描画
      this.renderPages();
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
          let sourcePdf = processedPDFs.get(page.fileName);
          if (!sourcePdf) {
            // ArrayBufferが有効かチェック
            if (!page.pdfData || page.pdfData.byteLength === 0) {
              throw new Error(`${page.fileName}のデータが無効です。`);
            }
            sourcePdf = await PDFLib.PDFDocument.load(page.pdfData, { ignoreEncryption: true });
            processedPDFs.set(page.fileName, sourcePdf);
          }

          // ページインデックスが有効かチェック
          const pageCount = sourcePdf.getPageCount();
          const pageIndex = page.pageNumber - 1;
          if (pageIndex >= pageCount || pageIndex < 0) {
            throw new Error(`${page.fileName}のページ${page.pageNumber}が見つかりません。`);
          }

          const [copiedPage] = await mergedPdf.copyPages(sourcePdf, [pageIndex]);

          // 回転を適用
          if (page.rotation !== 0) {
            copiedPage.setRotation(PDFLib.degrees(page.rotation));
          }

          mergedPdf.addPage(copiedPage);

        } catch (pageError) {
          console.error(`ページ処理エラー (${page.fileName}, ページ${page.pageNumber}):`, pageError);
          throw new Error(`${page.fileName}のページ${page.pageNumber}の処理中にエラーが発生しました: ${pageError.message}`);
        }
      }
      const pdfBytes = await mergedPdf.save();
      this.downloadPDF(pdfBytes);
    } catch (error) {
      console.error('PDF結合エラー:', error);
      alert(`PDF結合中にエラーが発生しました:\n${error.message}`);
    } finally {
      this.hideLoading();
    }
  }

  downloadPDF(pdfBytes) {
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'merged.pdf';
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

  // ページカウンターを更新するメソッドを追加
  updatePageCounter() {
    const pageCounter = document.getElementById('pageCounter');
    if (pageCounter) {
      pageCounter.textContent = `${this.currentPreviewIndex + 1} / ${this.pages.length}`;
    }
  }

  // PDFページの動的生成
  async generatePDFPage(pageData) {
    try {
      // PDFデータのディープコピーを作成（非同期処理の安全対策）
      const pdfData = pageData.pdfData.slice(0);
      if (!pdfData) {
        console.error('PDFデータが見つかりません:', pageData);
        return null;
      }

      // PDFの読み込み
      const pdf = await pdfjsLib.getDocument(new Uint8Array(pdfData)).promise;
      const pdfPage = await pdf.getPage(pageData.pageNumber);
      return await this.renderPdfPageToDataURL(pdfPage, 1.5, pageData.rotation);
    } catch (error) {
      console.error('PDFページ生成エラー:', {
        error: error.message,
        pageNumber: pageData.pageNumber,
        rotation: pageData.rotation
      });
      throw error;
    }
  }

  async drawImage(index) {
    try {
      this.currentPreviewIndex = index;
      const page = this.pages[index];
      this.previewImage.src = await this.generatePDFPage(page);
      // ナビゲーションボタンの状態を更新
      this.updateNavigationButtons();
      // ページカウンターを更新
      this.updatePageCounter();
    } catch (error) {
      console.error('プレビュー表示エラー:', error);
      alert('プレビューの表示中にエラーが発生しました。');
    }
  }

  // モーダルを表示
  async showPreview(index) {
    await this.drawImage(index);
    document.addEventListener('keydown', this.handlePreviewKeyDown);
    this.previewModal.style.display = 'flex';
  }

  // モーダルを閉じる
  closePreview() {
    document.removeEventListener('keydown', this.handlePreviewKeyDown);
    this.previewModal.style.display = 'none';
  }

  // ナビゲーションボタンの状態を更新
  updateNavigationButtons() {
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');

    // 最初のページでは「前へ」ボタンを無効化
    prevBtn.disabled = (this.currentPreviewIndex === 0);

    // 最後のページでは「次へ」ボタンを無効化
    nextBtn.disabled = (this.currentPreviewIndex === this.pages.length - 1);
  }
}

// アプリケーション初期化
let pdfMerger;
document.addEventListener('DOMContentLoaded', () => {
  pdfMerger = new PDFMerger();
});
