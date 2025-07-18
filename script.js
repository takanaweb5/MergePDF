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
    this.saveBtn = document.getElementById('saveBtn');
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
    this.saveBtn.addEventListener('click', this.savePDF.bind(this));
    this.closeModalBtn.addEventListener('click', this.closePreview.bind(this));

    // 前のページへボタン
    document.getElementById('prevPageBtn').addEventListener('click', () => {
      this.drawImage(this.currentPreviewIndex - 1);
    });

    // 次のページへボタン
    document.getElementById('nextPageBtn').addEventListener('click', () => {
      this.drawImage(this.currentPreviewIndex + 1);
    });

    // 回転ボタン
    document.getElementById('rotatePreviewBtn').addEventListener('click', () => {
      this.rotatePreviewPage();
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
      const pdfPage = await pdf.getPage(pageNum);
      const rotation = pdfPage._pageInfo.rotate;
      const thumbnail = await this.renderPdfPageToDataURL(pdfPage, 1.5, rotation);
      this.pages.push({
        id: this.counter++,
        fileName: file.name, // PDFファイル名
        pageNumber: pageNum, // PDFファイル内のページ番号
        totalPages: pdf.numPages, // PDFファイル内の総ページ数
        thumbnail: thumbnail, // サムネイル画像(data:image/png)
        pdfData: pdfData,  // PDFファイル全体のバイナリデータ(1ページ分ではない)
        rotation: rotation, // 回転角度
        image: null // サムネイルを表示するimgタグエレメント
      });
    }
  }

  updateUI() {
    this.pagesGrid.innerHTML = '';
    for (const page of this.pages) {
      const pageElement = this.createPageElement(page);
      this.pagesGrid.appendChild(pageElement);
    }
    this.controls.style.display = this.pages.length > 0 ? 'flex' : 'none';
    this.pageCount.textContent = `${this.pages.length}ページ`;
    this.setupSortable();
  }

  createPageElement(page) {
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
    page.image = thumbnail;

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

    return pageElement;
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
      page.thumbnail = await this.generatePDFPage(page);
      // サムネイルを再描画
      page.image.src = page.thumbnail;
    }
  }

  async savePDF() {
    if (this.pages.length === 0) {
      alert('結合するページがありません。');
      return;
    }

    // 処理済みPDFを保持するMap
    const processedPDFs = new Map();
    const mergedPdf = await PDFLib.PDFDocument.create();

    function downloadPDF(pdfBytes) {
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

    /**
     * ページをコピーして返す
     * @param {Object} page - コピー元のページ情報
     * @param {Object} mergedPdf - 結合先のPDFドキュメント
     * @returns {Promise<Object>} コピーされたPDFページ
     */
    async function getCopiedPage(page, mergedPdf) {
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

      return copiedPage;
    }

    this.showLoading();
    try {
      for (const page of this.pages) {
        try {
          const copiedPage = await getCopiedPage(page, mergedPdf);
          mergedPdf.addPage(copiedPage);
        } catch (pageError) {
          console.error(`ページ処理エラー (${page.fileName}, ページ${page.pageNumber}):`, pageError);
          throw new Error(`${page.fileName}のページ${page.pageNumber}の処理中にエラーが発生しました: ${pageError.message}`);
        }
      }
      const pdfBytes = await mergedPdf.save();
      downloadPDF(pdfBytes);
    } catch (error) {
      console.error('PDF結合エラー:', error);
      alert(`PDF結合中にエラーが発生しました:\n${error.message}`);
    } finally {
      this.hideLoading();
    }
  }

  showLoading() {
    this.loading.style.display = 'flex';
  }

  hideLoading() {
    this.loading.style.display = 'none';
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
      this.previewImage.src = page.thumbnail;
      // ナビゲーションボタンの状態を更新
      this.updateNavigationButtons();
      // ページカウンターを更新
      this.updatePageCounter();
    } catch (error) {
      console.error('プレビュー表示エラー:', error);
      alert('プレビューの表示中にエラーが発生しました。');
    }
  }

  updateNavigationButtons() {
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');
    prevBtn.disabled = (this.currentPreviewIndex === 0);
    nextBtn.disabled = (this.currentPreviewIndex === this.pages.length - 1);
  }
  updatePageCounter() {
    const pageCounter = document.getElementById('pageCounter');
    if (pageCounter) {
      pageCounter.textContent = `${this.currentPreviewIndex + 1} / ${this.pages.length}`;
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

  // プレビュー画面の回転処理
  async rotatePreviewPage() {
    const page = this.pages[this.currentPreviewIndex];
    if (!page) return;
    await this.rotatePage(page.id, 90);
    await this.drawImage(this.currentPreviewIndex);
  }
}

// アプリケーション初期化
let pdfMerger;
document.addEventListener('DOMContentLoaded', () => {
  pdfMerger = new PDFMerger();
});
