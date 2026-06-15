import { useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { library } from '@fortawesome/fontawesome-svg-core';
import { fas } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import toast, { Toaster } from 'react-hot-toast'; // ✨ トースト追加！
library.add(fas);

// ✨ みつきのGAS URLを設定！
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyq_kqREkoL8e0XyHsP25DlUFh48LNIu1GyBSU9EW0ioKFbnnGAJ0ECi4NTo-0sR3TM/exec';

const UUID_NAMESPACE = '1b671a64-40d5-491e-99b0-da01ff1f3341';

function App() {
  const [memos, setMemos] = useState([]);
  const [newMemo, setNewMemo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [showTrash, setShowTrash] = useState(false);
  const [selectedColor, setSelectedColor] = useState('#ffffff');
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [folders, setFolders] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedMemo, setSelectedMemo] = useState(null);
  const [searchType, setSearchType] = useState('text');
  const [folderSearchId, setFolderSearchId] = useState('');
  const [openFolders, setOpenFolders] = useState({});
  const [isOpenUncategorized, setIsOpenUncategorized] = useState(false);
  const [selectedMemos, setSelectedMemos] = useState(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginInputId, setLoginInputId] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [theme, setTheme] = useState('pink');
  const [showMenu, setShowMenu] = useState(false);
  const [isMobile, setIsMobile] = useState(true);

  // Undo/Redo 用
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const historyRef = useRef([]);
  const indexRef = useRef(-1);
  const textareaRef = useRef(null);

  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { indexRef.current = historyIndex; }, [historyIndex]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  const themeColors = {
    pink: { bg: '#fff5f8', main: '#ff80ab', dark: '#ff4081', light: '#fce4ec', text: '#333' },
    blue: { bg: '#e3f2fd', main: '#64b5f6', dark: '#1976d2', light: '#bbdefb', text: '#333' },
    green: { bg: '#e8f5e8', main: '#81c784', dark: '#388e3c', light: '#c8e6c9', text: '#333' },
    dark: { bg: '#121212', main: '#90caf9', dark: '#42a5f5', light: '#424242', text: '#fff' }
  };
  const t = themeColors[theme];

  const isValidUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
  const getFolderDeviceId = (id) => (!id ? null : isValidUUID(id) ? id : uuidv5(id, UUID_NAMESPACE));

  useEffect(() => {
    let id = localStorage.getItem('deviceId');
    if (!id || id.trim() === '') {
      id = uuidv4();
      localStorage.setItem('deviceId', id);
    }
    setDeviceId(id);
  }, []);

  // ✨ 裏側でこっそり通信する関数（画面を止めない！）
  const fetchGas = async (payload) => {
    try {
      const response = await fetch(GAS_URL, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      return data;
    } catch (error) {
      console.error('GAS Error:', error);
      throw error; // Promiseでエラーをキャッチさせるために投げる
    }
  };

  const fetchData = useCallback(async () => {
    if (!deviceId) return;
    try {
      const folderRes = await fetchGas({ action: 'getFolders', deviceId: getFolderDeviceId(deviceId) });
      if (folderRes) setFolders(folderRes.data || []);

      const memoRes = await fetchGas({ action: 'getMemos', deviceId });
      if (memoRes) {
        let filtered = (memoRes.data || []).filter(m => (m.is_deleted === true || m.is_deleted === 'true') === showTrash);
        
        if (searchType === 'text' && searchQuery) {
          filtered = filtered.filter(m => String(m.text || '').toLowerCase().includes(searchQuery.toLowerCase()));
        }
        if (searchType === 'date' && selectedDate) {
          const start = new Date(selectedDate).setHours(0,0,0,0);
          const end = new Date(selectedDate).setHours(23,59,59,999);
          filtered = filtered.filter(m => {
            const d = new Date(m.created_at).getTime();
            return d >= start && d <= end;
          });
        }
        if (folderSearchId) {
          filtered = filtered.filter(m => String(m.folder_id) === String(folderSearchId));
        }
        filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setMemos(filtered);
      }
    } catch (e) {
      // 初期読み込み時のエラーはサイレントにするか、小さく出す
      console.error('読み込み失敗:', e);
    }
  }, [deviceId, showTrash, searchType, searchQuery, selectedDate, folderSearchId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
  };

  const createFolder = async () => {
    if (!newFolderName.trim() || !deviceId) return;
    const newFolder = { id: uuidv4(), name: newFolderName.trim(), device_id: getFolderDeviceId(deviceId) };
    
    // ✨ 即座に画面更新（爆速！）
    setFolders(prev => [...prev, newFolder]);
    setNewFolderName('');
    
    // 裏でGAS通信、トーストで結果表示
    toast.promise(
      fetchGas({ action: 'createFolder', folder: newFolder }),
      { loading: 'フォルダ作成中...', success: 'フォルダを作ったよ！', error: '作成失敗💦' }
    );
  };

  const deleteFolder = async (folderId) => {
    if (!isSelectMode) return;
    if (!window.confirm('フォルダを削除しますか？（メモは未分類へ移動）')) return;

    // 即座に画面から消す
    setFolders(prev => prev.filter(f => f.id !== folderId));
    setMemos(prev => prev.map(m => String(m.folder_id) === String(folderId) ? { ...m, folder_id: null } : m));
    
    toast.promise(
      fetchGas({ action: 'deleteFolder', folderId }),
      { loading: '削除中...', success: '削除したよ！', error: 'エラーが発生しました' }
    );
  };

  const handleFileChange = (e) => setSelectedFile(e.target.files[0]);

  const addMemo = async () => {
    if (!newMemo.trim() || !deviceId) return;
    
    let fileData = null;
    let fileName = null;
    if (selectedFile) {
      if (selectedFile.size > 5 * 1024 * 1024) return toast.error('ファイルが大きすぎるよ！5MB以下にしてね！');
      fileData = await fileToBase64(selectedFile);
      fileName = `${uuidv4()}.${selectedFile.name.split('.').pop()}`;
    }

    const newMemoObj = {
      id: uuidv4(),
      text: newMemo.trim(),
      created_at: new Date().toISOString(),
      device_id: deviceId,
      is_deleted: false,
      color: selectedColor,
      file_url: '', 
      is_public: false,
      folder_id: selectedFolderId || '',
    };

    // ✨ 即座に画面更新（待たせない！）
    setMemos(prev => [newMemoObj, ...prev]);
    setNewMemo('');
    setSelectedFile(null);
    setSelectedFolderId('');

    toast.promise(
      fetchGas({ action: 'addMemo', memo: newMemoObj, fileData, fileName }),
      { loading: '保存中...', success: 'メモを追加したよ！', error: '保存エラー💦' }
    ).then(() => {
      if (fileData) fetchData(); // 画像がある時だけ、URLを取得するために再読み込み
    });
  };

  const updateMemo = async () => {
    if (!selectedMemo) return;
    
    let fileData = null;
    let fileName = null;
    if (selectedFile) {
      if (selectedFile.size > 5 * 1024 * 1024) return toast.error('ファイルは5MB以下にしてね！');
      fileData = await fileToBase64(selectedFile);
      fileName = `${uuidv4()}.${selectedFile.name.split('.').pop()}`;
    }

    const updated = { ...selectedMemo, folder_id: selectedMemo.folder_id || '' };
    
    // ✨ 即座に画面更新！
    setMemos(prev => prev.map(m => m.id === updated.id ? updated : m));
    setSelectedMemo(null);
    setSelectedFile(null);

    toast.promise(
      fetchGas({ action: 'updateMemo', memo: updated, fileData, fileName }),
      { loading: '更新中...', success: '更新したよ！', error: '更新エラー💦' }
    ).then(() => {
      if (fileData) fetchData();
    });
  };

  const deleteMemo = async (id) => {
    setSelectedMemo(null);
    // 即座に画面から消す
    setMemos(prev => prev.filter(m => m.id !== id));
    
    toast.promise(
      fetchGas({ action: 'updateMemoStatus', id, field: 'is_deleted', value: true }),
      { loading: '削除中...', success: 'ゴミ箱に入れたよ', error: 'エラー💦' }
    );
  };

  const bulkDelete = async () => {
    if (selectedMemos.size === 0) return;
    if (!window.confirm(`選択した ${selectedMemos.size} 件を削除しますか？`)) return;
    
    const idsArray = Array.from(selectedMemos);
    // 即座に画面から消す
    setMemos(prev => prev.filter(m => !idsArray.includes(m.id)));
    setSelectedMemos(new Set());
    setIsSelectMode(false);
    
    toast.promise(
      fetchGas({ action: 'deleteMemos', ids: idsArray }),
      { loading: '一括削除中...', success: '削除したよ！', error: 'エラー💦' }
    );
  };

  const restoreMemo = async (id) => {
    setMemos(prev => prev.filter(m => m.id !== id));
    toast.promise(
      fetchGas({ action: 'updateMemoStatus', id, field: 'is_deleted', value: false }),
      { loading: '復元中...', success: '復元したよ！', error: 'エラー💦' }
    );
  };

  const clearTrash = async () => {
    if (!window.confirm('ゴミ箱を空にしますか？（元に戻せません！）')) return;
    setMemos([]);
    toast.promise(
      fetchGas({ action: 'clearTrash', deviceId }),
      { loading: 'お掃除中...', success: 'ゴミ箱を空にしたよ！', error: 'エラー💦' }
    );
  };

  const shareMemo = async (id) => {
    const shareUrl = `${window.location.origin}/share/${id}`;
    const memoText = selectedMemo.text;

    // 裏で公開ステータスにする
    fetchGas({ action: 'updateMemoStatus', id, field: 'is_public', value: true });

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Cocotteメモ', text: memoText, url: shareUrl });
        toast.success('共有画面を開いたよ！');
      } catch (err) { fallbackCopy(shareUrl, memoText); }
    } else { fallbackCopy(shareUrl, memoText); }
  };

  const fallbackCopy = async (url, text) => {
    try {
      await navigator.clipboard.writeText(`${url}\n\n${text}`);
      toast.success('URLと本文をコピーしたよ！');
    } catch (err) { 
      toast.error('コピー失敗💦手動でコピーしてね！'); 
    }
  };

  const exportData = () => {
    const data = { deviceId, folders, memos, exportDate: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cocotte_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('バックアップを保存したよ！✨');
    setShowMenu(false);
  };

  const importData = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.memos || !data.folders) throw new Error('データ形式が違うみたい…');
        if (window.confirm(`【警告】現在のデータを上書き復元する？`)) {
          localStorage.setItem('deviceId', data.deviceId);
          setDeviceId(data.deviceId);
          toast.success('IDを復元したよ！再読み込みします✨');
          setTimeout(() => window.location.reload(), 1500);
        }
      } catch (error) { toast.error('読み込みエラー💦'); }
    };
    reader.readAsText(file);
    event.target.value = '';
    setShowMenu(false);
  };

  const changeDeviceId = () => {
    const newId = window.prompt('新しいデバイスID（空欄でランダム）:');
    if (newId === null) return;
    const finalId = newId.trim() === '' ? uuidv4() : newId.trim().replace(/\s/g, '');
    localStorage.setItem('deviceId', finalId);
    setDeviceId(finalId);
    setFolders([]); setMemos([]);
    toast.success('IDを変更したよ！');
  };
  
  const loginWithId = () => {
    let input = loginInputId.trim().replace(/\s/g, '');
    if (!input) return toast.error('IDが空だよ！');
    localStorage.setItem('deviceId', input);
    setDeviceId(input);
    setShowLoginModal(false);
    setLoginInputId('');
    setFolders([]); setMemos([]);
    toast.success('ログインしたよ！');
  };

  const toggleFolder = (folderId) => setOpenFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
  
  // ✨ e.split エラーの完全防御 ✨
  const highlightText = (text) => {
    const safeText = String(text || ''); // 絶対に文字列にする！
    if (!searchQuery || searchType !== 'text') return safeText;
    try {
      const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escaped})`, 'gi');
      return safeText.split(regex).map((part, i) => regex.test(part) ? <mark key={i} style={{ background: t.main, color: 'white' }}>{part}</mark> : part);
    } catch { return safeText; }
  };
  const getTitle = (text) => {
    const safeText = String(text || ''); // 絶対に文字列にする！
    return <span>{highlightText(safeText.split('\n')[0] || '（無題）')}</span>;
  };

  const toggleSelectMemo = (id) => {
    setSelectedMemos(prev => {
      const newSet = new Set(prev);
      newSet.has(id) ? newSet.delete(id) : newSet.add(id);
      return newSet;
    });
  };

  const onDragEnd = async (result) => {
    if (!result.destination || result.source.droppableId === result.destination.droppableId) return;
    let newFolderId = result.destination.droppableId === 'uncategorized' ? '' : result.destination.droppableId.replace('folder-', '');
    
    // 即座に画面更新！
    setMemos(prev => prev.map(m => String(m.id) === String(result.draggableId) ? { ...m, folder_id: newFolderId || null } : m));
    
    toast.promise(
      fetchGas({ action: 'updateMemoStatus', id: result.draggableId, field: 'folder_id', value: newFolderId }),
      { loading: '移動中...', success: '移動したよ！', error: 'エラー💦' }
    );
  };

  const scrollToInput = () => document.querySelector('textarea')?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const undo = useCallback(() => {
    if (indexRef.current <= 0) return;
    const newIdx = indexRef.current - 1;
    setHistoryIndex(newIdx);
    setSelectedMemo(prev => ({ ...prev, text: historyRef.current[newIdx] }));
  }, []);

  const redo = useCallback(() => {
    if (indexRef.current >= historyRef.current.length - 1) return;
    const newIdx = indexRef.current + 1;
    setHistoryIndex(newIdx);
    setSelectedMemo(prev => ({ ...prev, text: historyRef.current[newIdx] }));
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (!selectedMemo) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedMemo, undo, redo]);

  const addToHistory = useCallback((text) => {
    if (text === historyRef.current[indexRef.current]) return;
    const newHistory = historyRef.current.slice(0, indexRef.current + 1);
    newHistory.push(text);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, []);

  useEffect(() => {
    if (selectedMemo && history.length === 0) {
      setHistory([selectedMemo.text || '']);
      setHistoryIndex(0);
    }
  }, [selectedMemo]);

  return (
    <div style={{ backgroundColor: t.bg, color: t.text, minHeight: '100vh', padding: '20px', fontFamily: 'Arial, sans-serif', boxSizing: 'border-box' }}>
      
      {/* ✨ トースト通知の表示場所 */}
      <Toaster position="top-center" toastOptions={{ style: { borderRadius: '20px', background: '#333', color: '#fff', fontWeight: 'bold' } }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ background: `linear-gradient(135deg, ${t.main}, ${t.dark})`, padding: '16px 32px', borderRadius: '40px', boxShadow: `0 8px 20px ${t.dark}55, inset 0 0 20px rgba(255,255,255,0.3)`, border: '6px solid #fff', position: 'relative', display: 'inline-block' }}>
          <div style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', background: t.main, padding: '4px 12px', borderRadius: '20px', border: '4px solid #fff', fontSize: '18px', color: 'white' }}>
            <FontAwesomeIcon icon="utensils" />
          </div>
          <h1 style={{ margin: 0, fontSize: '36px', color: 'white', textShadow: '2px 2px 4px rgba(0,0,0,0.4)' }}>Cocotte</h1>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button onClick={() => setShowHelp(true)} style={{ background: t.main, color: 'white', border: 'none', padding: isMobile ? '14px' : '12px 20px', borderRadius: '50%', fontSize: '20px', cursor: 'pointer', boxShadow: `0 6px 18px ${t.dark}4d`, height: '50px', display: 'flex', alignItems: 'center' }}>
            <FontAwesomeIcon icon="question" />
            {!isMobile && <span style={{ marginLeft: '8px', fontSize: '16px' }}>使い方</span>}
          </button>

          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowMenu(!showMenu)} style={{ background: t.main, color: 'white', border: 'none', padding: '12px', borderRadius: '50%', width: '50px', height: '50px', fontSize: '24px', cursor: 'pointer' }}>
              <FontAwesomeIcon icon="bars" />
            </button>
            {showMenu && (
              <div style={{ position: 'absolute', right: 0, top: '60px', background: 'white', borderRadius: '20px', boxShadow: `0 10px 30px ${t.dark}66`, padding: '15px', zIndex: 1000, minWidth: '220px', border: `2px solid ${t.light}` }}>
                <div style={{ fontWeight: 'bold', color: t.dark, marginBottom: '10px' }}>テーマ変更</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '15px' }}>
                  <button onClick={() => {setTheme('pink'); setShowMenu(false)}} style={{ background: '#ff80ab', color: 'white', padding: '10px', borderRadius: '12px' }}>ピンク</button>
                  <button onClick={() => {setTheme('blue'); setShowMenu(false)}} style={{ background: '#64b5f6', color: 'white', padding: '10px', borderRadius: '12px' }}>ブルー</button>
                  <button onClick={() => {setTheme('green'); setShowMenu(false)}} style={{ background: '#81c784', color: 'white', padding: '10px', borderRadius: '12px' }}>グリーン</button>
                  <button onClick={() => {setTheme('dark'); setShowMenu(false)}} style={{ background: '#757575', color: 'white', padding: '10px', borderRadius: '12px' }}>ダーク</button>
                </div>
                <button onClick={() => {changeDeviceId(); setShowMenu(false)}} style={{ width: '100%', background: t.light, color: t.dark, padding: '10px', borderRadius: '12px', marginBottom: '8px' }}>ID変更</button>
                <button onClick={() => {setShowLoginModal(true); setShowMenu(false)}} style={{ width: '100%', background: t.light, color: t.dark, padding: '10px', borderRadius: '12px', marginBottom: '15px' }}>ログイン</button>
                
                <div style={{ borderTop: `2px dashed ${t.light}`, paddingTop: '10px' }}>
                  <button onClick={exportData} style={{ width: '100%', background: t.main, color: 'white', padding: '10px', borderRadius: '12px', marginBottom: '8px' }}>
                    <FontAwesomeIcon icon="download" /> バックアップ保存
                  </button>
                  <label style={{ width: '100%', background: '#ffb3c6', color: 'white', padding: '10px', borderRadius: '12px', display: 'block', textAlign: 'center', cursor: 'pointer', boxSizing: 'border-box' }}>
                    <FontAwesomeIcon icon="upload" /> データ復元
                    <input type="file" accept=".json" onChange={importData} style={{ display: 'none' }} />
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: '20px', padding: '16px 20px', background: t.light, borderRadius: '20px', boxShadow: `0 6px 18px ${t.dark}33`, textAlign: 'center' }}>
        <p style={{ margin: '0 0 8px 0', fontSize: '15px', color: t.dark, fontWeight: 'bold' }}>デバイスID</p>
        <p style={{ margin: 0, fontFamily: 'monospace', background: '#fff', padding: '12px 16px', borderRadius: '14px', color: t.dark, fontWeight: 'bold', fontSize: '16px', wordBreak: 'break-all' }}>{deviceId}</p>
        <button onClick={() => { navigator.clipboard.writeText(deviceId); toast.success('IDをコピーしたよ！'); }} style={{ marginTop: '10px', background: t.main, color: 'white', padding: '8px 16px', borderRadius: '12px', fontSize: '14px' }}>コピー</button>
      </div>

      <div style={{ background: t.light, padding: '20px', borderRadius: '20px', marginBottom: '20px', boxShadow: `0 6px 20px ${t.dark}33`, boxSizing: 'border-box' }}>
        <textarea value={newMemo} onChange={(e) => setNewMemo(e.target.value)} placeholder="メモを入力（1行目がタイトル）..." rows="4" style={{ width: '100%', padding: '14px', borderRadius: '14px', border: `3px solid ${t.main}`, fontSize: '16px', resize: 'vertical', background: theme === 'dark' ? '#333' : 'white', color: t.text, boxSizing: 'border-box' }} />
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '15px', alignItems: 'center' }}>
          <select value={selectedColor} onChange={(e) => setSelectedColor(e.target.value)} style={{ flex: '1 1 120px', padding: '14px', borderRadius: '14px', border: `2px solid ${t.main}`, background: 'white', color: t.text }}>
            <option value="#ffffff">白</option><option value="#ffe6f0">ピンク</option><option value="#e3f2fd">水色</option><option value="#e6ffe6">グリーン</option>
          </select>
          <select value={selectedFolderId} onChange={(e) => setSelectedFolderId(e.target.value)} style={{ flex: '1 1 140px', padding: '14px', borderRadius: '14px', border: `2px solid ${t.main}`, background: 'white', color: t.text }}>
            <option value="">未分類</option>
            {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <label style={{ flex: '1 1 180px', background: selectedFile ? t.dark : t.main, color: 'white', padding: '14px 16px', borderRadius: '14px', cursor: 'pointer', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <FontAwesomeIcon icon="paperclip" /> {selectedFile ? selectedFile.name : 'ファイル(5MB迄)'}
            <input type="file" onChange={handleFileChange} accept="image/*,.pdf" style={{ display: 'none' }} />
          </label>
          <input type="text" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="新フォルダ名" style={{ flex: '1 1 160px', padding: '14px', borderRadius: '14px', border: `2px solid ${t.main}`, background: 'white', color: t.text }} />
          <button onClick={createFolder} style={{ background: t.main, color: 'white', padding: '14px 20px', borderRadius: '30px', fontWeight: 'bold' }}>作成</button>
          <button onClick={addMemo} style={{ background: t.dark, color: 'white', padding: '14px 28px', borderRadius: '30px', fontWeight: 'bold' }}>追加</button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '12px 0 30px 0', background: t.light, padding: '12px', borderRadius: '18px', flexWrap: 'wrap' }}>
        <FontAwesomeIcon icon="search" style={{ color: t.main, fontSize: '20px' }} />
        <select value={searchType} onChange={(e) => { setSearchType(e.target.value); setSearchQuery(''); setSelectedDate(null); setFolderSearchId(''); }} style={{ padding: '10px', border: `2px solid ${t.main}`, borderRadius: '12px', background: 'white', color: t.text }}>
          <option value="text">文字</option><option value="date">日付</option><option value="folder">フォルダ</option>
        </select>
        {searchType === 'text' && <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="検索..." style={{ flex: '1 1 200px', padding: '10px', border: `2px solid ${t.main}`, borderRadius: '12px', background: 'white', color: t.text }} />}
        {searchType === 'date' && <DatePicker selected={selectedDate} onChange={setSelectedDate} dateFormat="yyyy/MM/dd" placeholderText="日付を選択" style={{ flex: '1 1 200px', padding: '10px', border: `2px solid ${t.main}`, borderRadius: '12px', background: 'white', color: t.text }} />}
        {searchType === 'folder' && (
          <select value={folderSearchId} onChange={(e) => setFolderSearchId(e.target.value)} style={{ flex: '1 1 200px', padding: '10px', border: `2px solid ${t.main}`, borderRadius: '12px', background: 'white', color: t.text }}>
            <option value="">全てのフォルダ</option>
            {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        )}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <button onClick={() => setShowTrash(!showTrash)} style={{ background: t.main, color: 'white', padding: '10px 16px', borderRadius: '24px' }}>
          <FontAwesomeIcon icon="trash-alt" /> {showTrash ? '一覧に戻る' : 'ゴミ箱'}
        </button>
        {showTrash && <button onClick={clearTrash} style={{ background: t.main, color: 'white', padding: '10px 16px', borderRadius: '24px' }}>空にする</button>}
        <button onClick={() => { setIsSelectMode(!isSelectMode); setSelectedMemos(new Set()); }} style={{ background: t.main, color: 'white', padding: '10px 16px', borderRadius: '24px' }}>
          {isSelectMode ? '選択終了' : '選択モード'}
        </button>
      </div>

      {isSelectMode && selectedMemos.size > 0 && (
        <button onClick={bulkDelete} style={{ background: '#d32f2f', color: 'white', margin: '12px 0', padding: '10px 20px', borderRadius: '28px' }}>選択した {selectedMemos.size} 件を削除</button>
      )}

      <button onClick={scrollToInput} style={{ position: 'fixed', right: '20px', bottom: '20px', background: t.dark, color: 'white', width: '64px', height: '64px', borderRadius: '50%', fontSize: '32px', boxShadow: `0 6px 25px ${t.dark}88`, zIndex: 100, border: 'none', cursor: 'pointer' }}>
        <FontAwesomeIcon icon="plus" />
      </button>

      <h2 style={{ color: t.dark, margin: '20px 0 10px' }}>{showTrash ? 'ゴミ箱' : 'メモ一覧'}</h2>

      <DragDropContext onDragEnd={onDragEnd}>
        {!showTrash && (
          <div>
            {folders.map((folder) => {
              const folderMemos = memos.filter(m => String(m.folder_id) === String(folder.id));
              const isOpen = openFolders[folder.id] || false;
              return (
                <div key={folder.id} style={{ marginBottom: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', background: t.light, padding: '10px', borderRadius: '12px' }}>
                    <div onClick={() => toggleFolder(folder.id)} style={{ cursor: 'pointer', fontWeight: 'bold', color: t.dark }}>
                      {folder.name} ({folderMemos.length})
                    </div>
                    {isSelectMode && <button onClick={() => deleteFolder(folder.id)} style={{ background: t.main, color: 'white', padding: '6px 10px', borderRadius: '12px' }}>削除</button>}
                  </div>
                  {isOpen && (
                    <Droppable droppableId={`folder-${folder.id}`}>
                      {(provided) => (
                        <ul {...provided.droppableProps} ref={provided.innerRef} style={{ listStyle: 'none', padding: 0, margin: '8px 0' }}>
                          {folderMemos.map((memo, index) => (
                            <Draggable key={String(memo.id)} draggableId={String(memo.id)} index={index}>
                              {(provided, snapshot) => (
                                <li ref={provided.innerRef} {...provided.draggableProps} onClick={() => !isSelectMode && setSelectedMemo(memo)} style={{ ...provided.draggableProps.style, backgroundColor: memo.color, padding: '12px', margin: '6px 0', borderRadius: '12px', cursor: isSelectMode ? 'default' : 'pointer', display: 'flex', alignItems: 'center', color: t.dark, boxShadow: snapshot.isDragging ? `0 12px 28px ${t.main}77` : '0 2px 8px rgba(0,0,0,0.1)', position: 'relative', overflow: 'hidden' }}>
                                  {isSelectMode && <input type="checkbox" checked={selectedMemos.has(memo.id)} onChange={() => toggleSelectMemo(memo.id)} onClick={(e) => e.stopPropagation()} style={{ marginRight: '10px' }} />}
                                  <div {...provided.dragHandleProps} style={{ position: 'absolute', left: 0, top: 0, width: '36px', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab' }}>
                                    <div style={{ width: '6px', height: '24px', background: t.dark, borderRadius: '3px' }} />
                                  </div>
                                  <strong style={{ marginLeft: '40px', flex: 1, fontSize: '16px' }}>{getTitle(memo.text)}</strong>
                                </li>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </ul>
                      )}
                    </Droppable>
                  )}
                </div>
              );
            })}
            
            <div style={{ background: t.light, padding: '10px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', color: t.dark }} onClick={() => setIsOpenUncategorized(!isOpenUncategorized)}>
              未分類 ({memos.filter(m => !m.folder_id).length})
            </div>
            {isOpenUncategorized && (
              <Droppable droppableId="uncategorized">
                {(provided) => (
                  <ul {...provided.droppableProps} ref={provided.innerRef} style={{ listStyle: 'none', padding: 0 }}>
                    {memos.filter(m => !m.folder_id).map((memo, index) => (
                      <Draggable key={String(memo.id)} draggableId={String(memo.id)} index={index}>
                        {(provided) => (
                          <li ref={provided.innerRef} {...provided.draggableProps} onClick={() => !isSelectMode && setSelectedMemo(memo)} style={{ ...provided.draggableProps.style, backgroundColor: memo.color, padding: '12px', margin: '6px 0', borderRadius: '12px', display: 'flex', alignItems: 'center', color: t.dark, position: 'relative' }}>
                            {isSelectMode && <input type="checkbox" checked={selectedMemos.has(memo.id)} onChange={() => toggleSelectMemo(memo.id)} onClick={(e) => e.stopPropagation()} style={{ marginRight: '10px', marginLeft: '40px' }} />}
                            <div {...provided.dragHandleProps} style={{ position: 'absolute', left: 0, top: 0, width: '36px', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <div style={{ width: '6px', height: '24px', background: t.dark, borderRadius: '3px' }} />
                            </div>
                            <strong style={{ marginLeft: isSelectMode ? '0px' : '40px', flex: 1 }}>{getTitle(memo.text)}</strong>
                          </li>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </ul>
                )}
              </Droppable>
            )}
          </div>
        )}
      </DragDropContext>

      {showTrash && (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {memos.map(memo => (
            <li key={memo.id} style={{ backgroundColor: memo.color, padding: '12px', margin: '6px 0', borderRadius: '8px', display: 'flex', alignItems: 'center', color: t.dark }}>
              {isSelectMode && <input type="checkbox" checked={selectedMemos.has(memo.id)} onChange={() => toggleSelectMemo(memo.id)} onClick={(e) => e.stopPropagation()} style={{ marginRight: '10px' }} />}
              <strong>{getTitle(memo.text)}</strong>
              <button onClick={() => restoreMemo(memo.id)} style={{ marginLeft: 'auto', background: t.main, color: 'white', padding: '8px 14px', borderRadius: '20px' }}>復元</button>
            </li>
          ))}
        </ul>
      )}

      {selectedMemo && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: `${t.main}ee`, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px', boxSizing: 'border-box' }}>
          <div style={{ background: 'white', borderRadius: '32px', padding: '24px 20px', width: '100%', maxWidth: '560px', maxHeight: '92vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            <button onClick={() => setSelectedMemo(null)} style={{ alignSelf: 'flex-end', background: '#999', color: 'white', padding: '8px 16px', borderRadius: '20px', marginBottom: '12px' }}>✕ 閉じる</button>
            
            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginBottom: '16px' }}>
              <button onClick={undo} disabled={historyIndex <= 0} style={{ background: historyIndex <= 0 ? t.light : t.main, color: 'white', padding: '14px 18px', borderRadius: '50%' }}><FontAwesomeIcon icon="undo" /></button>
              <button onClick={redo} disabled={historyIndex >= history.length - 1} style={{ background: historyIndex >= history.length - 1 ? t.light : t.main, color: 'white', padding: '14px 18px', borderRadius: '50%' }}><FontAwesomeIcon icon="redo" /></button>
            </div>
            
            <textarea ref={textareaRef} value={selectedMemo.text} onChange={(e) => { setSelectedMemo(prev => ({ ...prev, text: e.target.value })); addToHistory(e.target.value); }} rows="10" style={{ width: '100%', padding: '16px', border: `3px solid ${t.main}`, borderRadius: '16px', fontSize: '16px', boxSizing: 'border-box' }} />
            
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '15px' }}>
              <select value={selectedMemo.color} onChange={(e) => setSelectedMemo(prev => ({ ...prev, color: e.target.value }))} style={{ flex: '1', padding: '14px', borderRadius: '14px', border: `2px solid ${t.main}` }}>
                <option value="#ffffff">白</option><option value="#ffe6f0">ピンク</option><option value="#e3f2fd">水色</option><option value="#e6ffe6">グリーン</option>
              </select>
              <select value={selectedMemo.folder_id || ''} onChange={(e) => setSelectedMemo(prev => ({ ...prev, folder_id: e.target.value || null }))} style={{ flex: '1', padding: '14px', borderRadius: '14px', border: `2px solid ${t.main}` }}>
                <option value="">未分類</option>{folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              <label style={{ flex: '1 1 100%', background: selectedMemo.file_url ? t.dark : t.main, color: 'white', padding: '14px', borderRadius: '14px', textAlign: 'center', cursor: 'pointer' }}>
                <FontAwesomeIcon icon="paperclip" /> {selectedMemo.file_url ? 'ファイル再選択' : 'ファイル添付'}
                <input type="file" onChange={(e) => { if (e.target.files[0]) setSelectedFile(e.target.files[0]); }} style={{ display: 'none' }} />
              </label>
            </div>
            
            {selectedMemo.file_url && (
              <div style={{ textAlign: 'center', marginTop: '8px' }}>
                <a href={selectedMemo.file_url} target="_blank" rel="noopener noreferrer" style={{ color: t.dark, fontWeight: 'bold' }}>添付ファイルを見る</a>
              </div>
            )}

            <div style={{ marginTop: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button onClick={updateMemo} style={{ background: t.dark, color: 'white', padding: '14px 30px', borderRadius: '30px' }}>保存</button>
              <button onClick={() => deleteMemo(selectedMemo.id)} style={{ background: '#d32f2f', color: 'white', padding: '14px 30px', borderRadius: '30px' }}>削除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
