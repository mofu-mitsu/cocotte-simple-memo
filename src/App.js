import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabase';
import { v4 as uuidv4 } from 'uuid';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { library } from '@fortawesome/fontawesome-svg-core';
import { fas } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
library.add(fas);

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
  const [showQRReader, setShowQRReader] = useState(false);
  const [openFolders, setOpenFolders] = useState({});
  const [isOpenUncategorized, setIsOpenUncategorized] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [selectedMemos, setSelectedMemos] = useState(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginInputId, setLoginInputId] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  // Undo/Redo 用（ref で最新を常に保持）
  const [history, setHistory] = useState([]);           // ['初期テキスト']
  const [historyIndex, setHistoryIndex] = useState(-1); // 0 が最新
  const historyRef = useRef([]);                        // 最新の history 配列
  const indexRef = useRef(-1);                          // 最新の index

  // ref を最新に保つ
  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { indexRef.current = historyIndex; }, [historyIndex]);

  const qrCanvasRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const textareaRef = useRef(null);

  // デバイスID初期化
  useEffect(() => {
    let id = localStorage.getItem('deviceId');
    if (!id) {
      id = uuidv4();
      localStorage.setItem('deviceId', id);
    }
    setDeviceId(id);
  }, []);

  // データ取得
  useEffect(() => {
    if (deviceId) {
      fetchFolders();
      fetchMemos();
    }
  }, [deviceId, searchQuery, showTrash, selectedDate, folderSearchId]);

  // メモ選択時に履歴リセット（idが変わった時だけ）
  useEffect(() => {
    if (selectedMemo) {
      const initial = selectedMemo.text || '';
      setHistory([initial]);
      setHistoryIndex(0);
      console.log('履歴リセット', { text: initial });
    }
  }, [selectedMemo?.id]);

  // Undo
  const undo = useCallback(() => {
    if (indexRef.current <= 0) return;
    const newIdx = indexRef.current - 1;
    setHistoryIndex(newIdx);
    setSelectedMemo(prev => ({ ...prev, text: historyRef.current[newIdx] }));
    console.log('UNDO →', historyRef.current[newIdx]);
  }, []);

  // Redo
  const redo = useCallback(() => {
    if (indexRef.current >= historyRef.current.length - 1) return;
    const newIdx = indexRef.current + 1;
    setHistoryIndex(newIdx);
    setSelectedMemo(prev => ({ ...prev, text: historyRef.current[newIdx] }));
    console.log('REDO →', historyRef.current[newIdx]);
  }, []);

  // キー操作
  useEffect(() => {
    const handler = (e) => {
      if (!selectedMemo) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedMemo, undo, redo]);

  // 履歴に追加（同じなら無視）
  const addToHistory = useCallback((text) => {
    if (text === historyRef.current[indexRef.current]) return;

    const newHistory = historyRef.current.slice(0, indexRef.current + 1);
    newHistory.push(text);

    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    console.log('履歴追加', { index: newHistory.length - 1, text });
  }, []);

  const fetchFolders = async () => {
    const { data, error } = await supabase.from('folders').select('*').eq('device_id', deviceId);
    if (error) console.error('Error fetching folders:', error);
    else setFolders(data || []);
  };

  const createFolder = async () => {
    if (!newFolderName.trim() || !deviceId) return;
    const { data, error } = await supabase
      .from('folders')
      .insert([{ name: newFolderName.trim(), device_id: deviceId }])
      .select();
    if (error) {
      console.error('Error creating folder:', error);
      alert('フォルダ作成失敗: ' + error.message);
    } else {
      setNewFolderName('');
      if (data && data[0]) setFolders(prev => [...prev, data[0]]);
      fetchMemos();
    }
  };

  const deleteFolder = async (folderId) => {
    if (!isSelectMode) return;
    if (!confirm('フォルダを削除しますか？（メモは未分類へ移動）')) return;
    await supabase.from('memos').update({ folder_id: null }).eq('folder_id', folderId);
    const { error } = await supabase.from('folders').delete().eq('id', folderId);
    if (error) console.error('Error deleting folder:', error);
    else {
      setFolders(prev => prev.filter(f => f.id !== folderId));
      fetchMemos();
    }
  };

  const fetchMemos = async () => {
    let query = supabase.from('memos').select('*').eq('device_id', deviceId).eq('is_deleted', showTrash);
    if (searchType === 'text' && searchQuery) query = query.ilike('text', `%${searchQuery}%`);
    if (searchType === 'date' && selectedDate) {
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);
      query = query.gte('created_at', startOfDay.toISOString()).lte('created_at', endOfDay.toISOString());
    }
    if (folderSearchId) query = query.eq('folder_id', folderSearchId);
    const { data, error } = await query;
    if (error) console.error('Error fetching memos:', error);
    else setMemos(data || []);
  };

  const handleFileChange = (e) => setSelectedFile(e.target.files[0]);

  // uploadFile を改造（ファイル直接受け取れるように！）
  const uploadFile = async (fileToUpload) => {
    const file = fileToUpload || selectedFile;  // ←ここ追加！！
    if (!file) return null;
    const fileName = `${deviceId}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from('memos').upload(fileName, file);
    if (error) {
      console.error('アップロード失敗:', error);
      alert('アップロード失敗: ' + error.message);
      return null;
    }
    const { data } = supabase.storage.from('memos').getPublicUrl(fileName);
    return data.publicUrl;
  };

  const addMemo = async () => {
    if (!newMemo.trim() || !deviceId) return;
    const fileUrl = await uploadFile();
    const folderIdToUse = selectedFolderId || null;
    const { error } = await supabase
      .from('memos')
      .insert([{
        text: newMemo.trim(),
        created_at: new Date(),
        device_id: deviceId,
        is_deleted: false,
        color: selectedColor,
        file_url: fileUrl,
        is_public: false,
        folder_id: folderIdToUse,
      }]);
    if (error) {
      console.error('Error adding memo:', error);
      alert('メモ追加失敗: ' + error.message);
    } else {
      setNewMemo('');
      setSelectedFile(null);
      setSelectedFolderId('');
      fetchMemos();
    }
  };

  const deleteMemo = async (id) => {
    const { error } = await supabase.from('memos').update({ is_deleted: true }).eq('id', id);
    if (error) console.error('Error deleting memo:', error);
    else {
      setSelectedMemo(null);
      setSelectedMemos(new Set());
      fetchMemos();
    }
  };

  const bulkDelete = async () => {
    if (selectedMemos.size === 0 || !confirm(`選択した ${selectedMemos.size} 件を削除しますか？`)) return;
    const { error } = await supabase
      .from('memos')
      .update({ is_deleted: true })
      .in('id', Array.from(selectedMemos));
    if (error) console.error('Error bulk deleting:', error);
    else {
      setSelectedMemos(new Set());
      setIsSelectMode(false);
      fetchMemos();
    }
  };

  const restoreMemo = async (id) => {
    const { error } = await supabase.from('memos').update({ is_deleted: false }).eq('id', id);
    if (error) console.error('Error restoring memo:', error);
    else fetchMemos();
  };

  const clearTrash = async () => {
    const { error } = await supabase
      .from('memos')
      .delete()
      .eq('device_id', deviceId)
      .eq('is_deleted', true);
    if (error) console.error('Error clearing trash:', error);
    else fetchMemos();
  };

  const shareMemo = async (id) => {
    const { error } = await supabase.from('memos').update({ is_public: true }).eq('id', id);
    if (error) console.error('Error sharing memo:', error);
    else {
      const shareUrl = `${window.location.origin}/share/${id}`;
      navigator.clipboard.writeText(shareUrl);
      alert(`共有URLをコピーしました: ${shareUrl}`);
      fetchMemos();
    }
  };

  const updateMemo = async () => {
    if (!selectedMemo) return;
    const folderIdToUse = selectedMemo.folder_id || null;
    const { error } = await supabase
      .from('memos')
      .update({ text: selectedMemo.text, color: selectedMemo.color, folder_id: folderIdToUse })
      .eq('id', selectedMemo.id);
    if (error) {
      console.error('Error updating memo:', error);
      alert('更新失敗: ' + error.message);
    } else {
      setSelectedMemo(null);
      fetchMemos();
    }
  };

  const changeDeviceId = () => {
    const newId = prompt('デバイスIDを入力（共有用）:');
    if (newId) {
      localStorage.setItem('deviceId', newId);
      setDeviceId(newId);
      setSelectedFolderId('');
      setFolderSearchId('');
      fetchFolders();
      fetchMemos();
    }
  };

  const generateQR = () => {
    setShowQRCode(true);
    setTimeout(() => {
      if (qrCanvasRef.current) {
        QRCode.toCanvas(qrCanvasRef.current, deviceId, { width: 220 }, (error) => {
          if (error) console.error('Error generating QR:', error);
        });
      }
    }, 100);
  };

  const startQRReader = () => {
    setShowQRReader(true);
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        requestAnimationFrame(tick);
      })
      .catch(err => {
        alert('カメラアクセス失敗: ' + err.message);
        setShowQRReader(false);
      });
  };

  const tick = () => {
    if (!showQRReader) return;
    if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
      canvasRef.current.height = videoRef.current.videoHeight;
      canvasRef.current.width = videoRef.current.videoWidth;
      const ctx = canvasRef.current.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
      const imageData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code) {
        localStorage.setItem('deviceId', code.data);
        setDeviceId(code.data);
        setShowQRReader(false);
        fetchFolders();
        fetchMemos();
        if (videoRef.current.srcObject) {
          videoRef.current.srcObject.getTracks().forEach(track => track.stop());
        }
      } else {
        requestAnimationFrame(tick);
      }
    } else {
      requestAnimationFrame(tick);
    }
  };

  const toggleFolder = (folderId) => {
    setOpenFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const highlightText = (text) => {
    if (!searchQuery || searchType !== 'text') return text;
    try {
      const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escaped})`, 'gi');
      return text.split(regex).map((part, i) =>
        regex.test(part) ? <mark key={i} style={{ background: '#ff80ab', color: 'white', borderRadius: '4px', padding: '0 3px' }}>{part}</mark> : part
      );
    } catch { return text; }
  };

  const getTitle = (text) => {
    const title = text.split('\n')[0] || '（無題）';
    return <span>{highlightText(title)}</span>;
  };

  const toggleSelectMemo = (id) => {
    const newSet = new Set(selectedMemos);
    newSet.has(id) ? newSet.delete(id) : newSet.add(id);
    setSelectedMemos(newSet);
  };

  const onDragEnd = async (result) => {
    if (!result.destination || result.source.droppableId === result.destination.droppableId) return;
    let newFolderId = null;
    if (result.destination.droppableId.startsWith('folder-')) {
      newFolderId = result.destination.droppableId.replace('folder-', '');
    } else if (result.destination.droppableId === 'uncategorized') {
      newFolderId = null;
    }
    const { error } = await supabase.from('memos').update({ folder_id: newFolderId }).eq('id', result.draggableId);
    if (error) console.error('Error moving memo:', error);
    else fetchMemos();
  };

  const loginWithId = () => {
    if (loginInputId.trim()) {
      localStorage.setItem('deviceId', loginInputId.trim());
      setDeviceId(loginInputId.trim());
      setShowLoginModal(false);
      setLoginInputId('');
      fetchFolders();
      fetchMemos();
    }
  };

  const charCount = selectedMemo ? selectedMemo.text.length : 0;

  return (
    <div className="container" style={{ backgroundColor: '#fff5f8', color: '#d81b60', minHeight: '100vh', padding: '20px', fontFamily: 'Arial, sans-serif', boxSizing: 'border-box' }}>
      {/* タイトル（影小さく） */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px' }}>
        <div style={{ 
          background: 'linear-gradient(135deg, #ff80ab, #ff4081)', 
          padding: '16px 32px', 
          borderRadius: '40px', 
          boxShadow: '0 8px 20px rgba(255,64,129,0.35), inset 0 0 20px rgba(255,255,255,0.3)',
          border: '6px solid #fff',
          position: 'relative',
          display: 'inline-block'
        }}>
          <div style={{
            position: 'absolute',
            top: '-12px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#ff80ab',
            padding: '4px 12px',
            borderRadius: '20px',
            border: '4px solid #fff',
            fontSize: '18px',
            color: 'white'
          }}>
            <FontAwesomeIcon icon="utensils" />
          </div>
          <h1 style={{ margin: 0, fontSize: '36px', color: 'white', textShadow: '2px 2px 4px rgba(0,0,0,0.4)' }}>Cocotte</h1>
        </div>
        <button onClick={() => setShowHelp(true)} style={{ background: '#ff80ab', color: 'white', border: 'none', padding: '12px 18px', borderRadius: '30px', fontSize: '18px', cursor: 'pointer', boxShadow: '0 6px 18px rgba(255,64,129,0.3)' }}>
          <FontAwesomeIcon icon="question-circle" /> 使い方
        </button>
      </div>

      {/* デバイスID（影が被らないよう余白） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '20px', flexWrap: 'wrap', paddingTop: '10px' }}>
        <p style={{ margin: 0, fontSize: '15px' }}>
          デバイスID: <span className="device-id-text" style={{ fontFamily: 'monospace', background: '#fce4ec', padding: '8px 14px', borderRadius: '12px', color: '#d81b60' }}>{deviceId}</span>
        </p>
        <div style={{ display: 'flex', gap: '14px' }}>
          <button onClick={changeDeviceId} style={{ background: '#ff80ab', color: 'white', border: 'none', padding: '12px 18px', borderRadius: '28px', cursor: 'pointer' }}>
            <FontAwesomeIcon icon="id-card" /> ID変更
          </button>
          <button onClick={() => setShowLoginModal(true)} style={{ background: '#ff80ab', color: 'white', border: 'none', padding: '12px 18px', borderRadius: '28px', cursor: 'pointer' }}>
            <FontAwesomeIcon icon="sign-in-alt" /> ログイン
          </button>
          <button onClick={generateQR} style={{ background: '#ff80ab', color: 'white', border: 'none', padding: '12px 18px', borderRadius: '28px', cursor: 'pointer' }}>
            <FontAwesomeIcon icon="qrcode" /> QR生成
          </button>
          <button onClick={startQRReader} style={{ background: '#ff80ab', color: 'white', border: 'none', padding: '12px 18px', borderRadius: '28px', cursor: 'pointer' }}>
            <FontAwesomeIcon icon="camera" /> QR読取
          </button>
        </div>
      </div>

      {/* QRコード表示 */}
      {showQRCode && (
        <div style={{ margin: '20px 0', textAlign: 'center' }}>
          <canvas ref={qrCanvasRef} style={{ border: '4px solid #ff80ab', borderRadius: '20px', boxShadow: '0 10px 30px rgba(255,64,129,0.3)' }} />
          <button onClick={() => setShowQRCode(false)} style={{ marginTop: '15px', background: '#ff80ab', color: 'white', padding: '10px 20px', borderRadius: '30px', cursor: 'pointer' }}>閉じる</button>
        </div>
      )}

      {/* QRリーダー */}
      {showQRReader && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.9)', zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <video ref={videoRef} style={{ width: '90%', maxWidth: '400px', borderRadius: '20px' }} />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <button onClick={() => { setShowQRReader(false); if (videoRef.current?.srcObject) videoRef.current.srcObject.getTracks().forEach(t => t.stop()); }} style={{ marginTop: '20px', background: '#ff80ab', color: 'white', padding: '12px 24px', borderRadius: '30px' }}>キャンセル</button>
        </div>
      )}

      {/* メモ入力エリア（統一デザイン！！） */}
      <div style={{ background: '#fce4ec', padding: '20px', borderRadius: '20px', marginBottom: '20px', boxShadow: '0 6px 20px rgba(255,64,129,0.2)', boxSizing: 'border-box' }}>
        <textarea 
          value={newMemo} 
          onChange={(e) => setNewMemo(e.target.value)} 
          placeholder="メモを入力（1行目がタイトル）..." 
          rows="4" 
          style={{ 
            width: '100%', 
            maxWidth: '100%', 
            padding: '14px', 
            borderRadius: '14px', 
            border: '3px solid #ff80ab', 
            fontSize: '16px', 
            resize: 'vertical',
            boxSizing: 'border-box',
            lineHeight: '1.8'
          }} 
        />
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '15px', alignItems: 'center' }}>
          {/* ①色選択 */}
          <select value={selectedColor} onChange={(e) => setSelectedColor(e.target.value)} style={{ flex: '1 1 120px', padding: '14px', borderRadius: '14px', border: '2px solid #ff80ab', minWidth: '100px' }}>
            <option value="#ffffff">白</option>
            <option value="#ffe6f0">ピンク</option>
            <option value="#e3f2fd">水色</option>
            <option value="#e6ffe6">グリーン</option>
          </select>

          {/* ②フォルダ選択 */}
          <select value={selectedFolderId} onChange={(e) => setSelectedFolderId(e.target.value)} style={{ flex: '1 1 140px', padding: '14px', borderRadius: '14px', border: '2px solid #ff80ab', minWidth: '100px' }}>
            <option value="">未分類</option>
            {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>

          {/* ③ファイル選択＋選択済み表示 */}
          <label style={{ 
            flex: '1 1 180px', 
            background: selectedFile ? '#ff4081' : '#ff80ab', 
            color: 'white', 
            padding: '14px 16px', 
            borderRadius: '14px', 
            cursor: 'pointer', 
            textAlign: 'center',
            fontWeight: 'bold',
            fontSize: '14px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            <FontAwesomeIcon icon="paperclip" /> {
              selectedFile ? `選択済み: ${selectedFile.name}` : 'ファイル選択'
            }
            <input type="file" onChange={handleFileChange} accept="image/*,.pdf" style={{ display: 'none' }} />
          </label>

          {/* 新フォルダ入力＋作成ボタン */}
          <input type="text" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="新フォルダ名" style={{ flex: '1 1 160px', padding: '14px', borderRadius: '14px', border: '2px solid #ff80ab' }} />
          <button onClick={createFolder} style={{ background: '#ff80ab', color: 'white', padding: '14px 20px', borderRadius: '30px', fontWeight: 'bold' }}>作成</button>

          {/* 追加ボタン */}
          <button onClick={addMemo} style={{ background: '#ff4081', color: 'white', padding: '14px 28px', borderRadius: '30px', fontWeight: 'bold' }}>追加</button>
        </div>
      </div>

      {/* 検索バー（アイコン復活） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '12px 0 30px 0', background: '#fce4ec', padding: '12px', borderRadius: '18px', boxShadow: '0 4px 15px rgba(255,64,129,0.15)', flexWrap: 'wrap' }}>
        <FontAwesomeIcon icon="search" style={{ color: '#ff80ab', fontSize: '20px' }} />
        <select value={searchType} onChange={(e) => { setSearchType(e.target.value); setSearchQuery(''); setSelectedDate(null); setFolderSearchId(''); }} style={{ padding: '10px', border: '2px solid #ff80ab', borderRadius: '12px', background: 'white' }}>
          <option value="text">文字</option>
          <option value="date">日付</option>
          <option value="folder">フォルダ</option>
        </select>
        {searchType === 'text' && <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="メモを検索..." style={{ flex: '1 1 200px', padding: '10px', border: '2px solid #ff80ab', borderRadius: '12px' }} />}
        {searchType === 'date' && <DatePicker selected={selectedDate} onChange={setSelectedDate} dateFormat="yyyy/MM/dd" placeholderText="日付を選択" className="date-picker" style={{ flex: '1 1 200px', padding: '10px', border: '2px solid #ff80ab', borderRadius: '12px' }} />}
        {searchType === 'folder' && (
          <select value={folderSearchId} onChange={(e) => setFolderSearchId(e.target.value)} style={{ flex: '1 1 200px', padding: '10px', border: '2px solid #ff80ab', borderRadius: '12px', background: 'white' }}>
            <option value="">全てのフォルダ</option>
            {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        )}
        <button onClick={fetchMemos} style={{ padding: '10px 16px', background: '#ff80ab', color: 'white', borderRadius: '12px' }}>検索</button>
      </div>

      {/* 操作ボタン（ゴミ箱アイコン復活） */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <button onClick={() => setShowTrash(!showTrash)} style={{ background: '#ff80ab', color: 'white', padding: '10px 16px', borderRadius: '24px' }}>
          <FontAwesomeIcon icon="trash-alt" /> {showTrash ? '一覧に戻る' : 'ゴミ箱'}
        </button>
        {showTrash && <button onClick={clearTrash} style={{ background: '#ff80ab', color: 'white', padding: '10px 16px', borderRadius: '24px' }}>空にする</button>}
        <button onClick={() => { setIsSelectMode(!isSelectMode); setSelectedMemos(new Set()); }} style={{ background: '#ff80ab', color: 'white', padding: '10px 16px', borderRadius: '24px' }}>
          {isSelectMode ? '選択終了' : '選択モード'}
        </button>
      </div>

      {isSelectMode && selectedMemos.size > 0 && (
        <button onClick={bulkDelete} style={{ background: '#d32f2f', color: 'white', margin: '12px 0', padding: '10px 20px', borderRadius: '28px' }}>
          選択した {selectedMemos.size} 件を削除
        </button>
      )}

      <h2 style={{ color: '#ff4081', margin: '20px 0 10px' }}>{showTrash ? 'ゴミ箱' : 'メモ一覧'}</h2>

      <DragDropContext onDragEnd={onDragEnd}>
        {!showTrash && (
          <div>
            {folders.map((folder) => {
              const folderMemos = memos.filter(m => m.folder_id === folder.id);
              const isOpen = openFolders[folder.id] || false;
              return (
                <div key={folder.id} style={{ marginBottom: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', background: '#fce4ec', padding: '10px', borderRadius: '12px', boxShadow: '0 3px 10px rgba(255,64,129,0.15)' }}>
                    <div onClick={() => toggleFolder(folder.id)} style={{ cursor: 'pointer', fontWeight: 'bold', color: '#d81b60' }}>
                      {folder.name} ({folderMemos.length})
                    </div>
                    {isSelectMode && <button onClick={() => deleteFolder(folder.id)} style={{ background: '#ff80ab', color: 'white', padding: '6px 10px', borderRadius: '12px' }}>削除</button>}
                  </div>
                  {isOpen && (
                    <Droppable droppableId={`folder-${folder.id}`}>
                      {(provided) => (
                        <ul {...provided.droppableProps} ref={provided.innerRef} style={{ listStyle: 'none', padding: 0, margin: '8px 0' }}>
                          {folderMemos.map((memo, index) => (
                            <Draggable key={memo.id} draggableId={String(memo.id)} index={index}>
                              {(provided) => (
                                <li ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} onClick={() => !isSelectMode && setSelectedMemo(memo)}
                                  style={{ ...provided.draggableProps.style, backgroundColor: memo.color, padding: '12px', margin: '6px 0', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#d81b60', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                                  {isSelectMode && <input type="checkbox" checked={selectedMemos.has(memo.id)} onChange={() => toggleSelectMemo(memo.id)} onClick={(e) => e.stopPropagation()} style={{ marginRight: '10px' }} />}
                                  <strong>{getTitle(memo.text)}</strong>
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

            <div>
              <div onClick={() => setIsOpenUncategorized(!isOpenUncategorized)} style={{ background: '#fce4ec', padding: '10px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', color: '#d81b60', boxShadow: '0 3px 10px rgba(255,64,129,0.15)' }}>
                未分類 ({memos.filter(m => !m.folder_id).length})
              </div>
              {isOpenUncategorized && (
                <Droppable droppableId="uncategorized">
                  {(provided) => (
                    <ul {...provided.droppableProps} ref={provided.innerRef} style={{ listStyle: 'none', padding: 0, margin: '8px 0' }}>
                      {memos.filter(m => !m.folder_id).map((memo, index) => (
                        <Draggable key={memo.id} draggableId={String(memo.id)} index={index}>
                          {(provided) => (
                            <li ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} onClick={() => !isSelectMode && setSelectedMemo(memo)}
                              style={{ ...provided.draggableProps.style, backgroundColor: memo.color, padding: '12px', margin: '6px 0', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#d81b60', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                              {isSelectMode && <input type="checkbox" checked={selectedMemos.has(memo.id)} onChange={() => toggleSelectMemo(memo.id)} onClick={(e) => e.stopPropagation()} style={{ marginRight: '10px' }} />}
                              <strong>{getTitle(memo.text)}</strong>
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
          </div>
        )}
      </DragDropContext>

      {showTrash && (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {memos.map((memo) => (
            <li key={memo.id} style={{ backgroundColor: memo.color, padding: '12px', margin: '6px 0', borderRadius: '8px', display: 'flex', alignItems: 'center', color: '#d81b60', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
              {isSelectMode && <input type="checkbox" checked={selectedMemos.has(memo.id)} onChange={() => toggleSelectMemo(memo.id)} style={{ marginRight: '10px' }} />}
              <strong>{getTitle(memo.text)}</strong>
              <button onClick={() => restoreMemo(memo.id)} style={{ marginLeft: 'auto', background: '#ff80ab', color: 'white', padding: '8px 14px', borderRadius: '20px' }}>復元</button>
            </li>
          ))}
        </ul>
      )}

      {/* ログイン */}
      {showLoginModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(255,182,193,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: '25px', padding: '25px', maxWidth: '420px', width: '90%', boxShadow: '0 15px 40px rgba(255,64,129,0.4)' }}>
            <h3 style={{ color: '#ff4081', textAlign: 'center' }}>ログイン方法</h3>
            <input type="text" value={loginInputId} onChange={(e) => setLoginInputId(e.target.value)} placeholder="デバイスIDを入力" style={{ width: '100%', padding: '12px', border: '2px solid #ff80ab', borderRadius: '14px', marginBottom: '10px' }} />
            <button onClick={loginWithId} style={{ width: '100%', padding: '12px', background: '#ff80ab', color: 'white', borderRadius: '25px', marginBottom: '10px' }}>IDでログイン</button>
            <button onClick={() => { setShowLoginModal(false); startQRReader(); }} style={{ width: '100%', padding: '12px', background: '#ff80ab', color: 'white', borderRadius: '25px', marginBottom: '10px' }}>QRでログイン</button>
            <button onClick={() => setShowLoginModal(false)} style={{ width: '100%', padding: '12px', background: '#ccc', color: 'white', borderRadius: '25px' }}>キャンセル</button>
          </div>
        </div>
      )}

      {/* ヘルプ */}
      {showHelp && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(255,182,193,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: '25px', padding: '25px', maxWidth: '520px', width: '90%', boxShadow: '0 15px 40px rgba(255,64,129,0.4)' }}>
            <h3 style={{ color: '#ff4081', textAlign: 'center' }}>Cocotte の使い方</h3>
            <p style={{ color: '#d81b60', fontSize: '14px', lineHeight: '1.8' }}>
              <strong>・メモ追加</strong>: テキスト入力 → 色・フォルダ → 「追加」<br/>
              <strong>・Undo/Redo</strong>: 編集中に Ctrl+Z / Ctrl+Y<br/>
              <strong>・検索</strong>: 文字 / 日付 / フォルダ<br/>
              <strong>・共有</strong>: 詳細 → 共有 → URLコピー<br/>
              <strong>・ログイン</strong>: ID入力 or QRスキャン
            </p>
            <button onClick={() => setShowHelp(false)} style={{ background: '#ff80ab', color: 'white', padding: '12px 24px', borderRadius: '30px', margin: '0 auto', display: 'block' }}>閉じる</button>
          </div>
        </div>
      )}

      {/* メモ詳細（スクロール復活＋横長ゼロ！！） */}
      {selectedMemo && (
        <div style={{ 
          position: 'fixed', 
          top: 0, left: 0, 
          width: '100%', height: '100%', 
          background: 'rgba(255,182,193,0.95)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          zIndex: 1000,
          overflowY: 'auto',   // ←ここ追加でスクロール復活！！！
          padding: '20px 0'     // スマホで上下余裕作った
        }}>
          <div style={{ 
            background: 'white', 
            borderRadius: '30px', 
            padding: '30px', 
            maxWidth: '560px', 
            width: '90%', 
            boxShadow: '0 20px 60px rgba(255,64,129,0.5)', 
            boxSizing: 'border-box',
            maxHeight: '95vh',    // 高さ制限でスマホでも収まる
            overflowY: 'auto'     // 中身が長い時もスクロールOK
          }}>
            <h3 style={{ color: '#ff4081', textAlign: 'center', marginBottom: '20px' }}>
              {highlightText(getTitle(selectedMemo.text).props.children)}
            </h3>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginBottom: '20px' }}>
              <button onClick={undo} disabled={historyIndex <= 0} style={{ background: historyIndex <= 0 ? '#ffcdd2' : '#ff80ab', color: 'white', padding: '16px 20px', borderRadius: '50%', fontSize: '24px' }}>
                <FontAwesomeIcon icon="undo" />
              </button>
              <button onClick={redo} disabled={historyIndex >= history.length - 1} style={{ background: historyIndex >= history.length - 1 ? '#ffcdd2' : '#ff80ab', color: 'white', padding: '16px 20px', borderRadius: '50%', fontSize: '24px' }}>
                <FontAwesomeIcon icon="redo" />
              </button>
            </div>
            <div style={{ textAlign: 'right', color: '#d81b60', fontWeight: 'bold', marginBottom: '10px' }}>文字数: {charCount}</div>
            <textarea 
              ref={textareaRef} 
              value={selectedMemo.text} 
              onChange={(e) => { 
                setSelectedMemo(prev => ({ ...prev, text: e.target.value })); 
                addToHistory(e.target.value); 
              }} 
              rows="12" 
              style={{ 
                width: '100%', 
                maxWidth: '100%', 
                padding: '16px', 
                border: '3px solid #ff80ab', 
                borderRadius: '16px', 
                fontSize: '16px', 
                resize: 'vertical',
                boxSizing: 'border-box',
                lineHeight: '1.8'  // ここも行間開けた！
              }} 
            />
            {/* 色・フォルダ・ファイル 全部横並び＋選択済み表示！！ */}
            <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                {/* ①色選択 */}
                <select 
                  value={selectedMemo.color} 
                  onChange={(e) => setSelectedMemo(prev => ({ ...prev, color: e.target.value }))}
                  style={{ flex: '1 1 120px', padding: '14px', borderRadius: '14px', border: '2px solid #ff80ab', minWidth: '100px' }}
                >
                  <option value="#ffffff">白</option>
                  <option value="#ffe6f0">ピンク</option>
                  <option value="#e3f2fd">水色</option>
                  <option value="#e6ffe6">グリーン</option>
                </select>

                {/* ②フォルダ選択 */}
                <select 
                  value={selectedMemo.folder_id || ''} 
                  onChange={(e) => setSelectedMemo(prev => ({ ...prev, folder_id: e.target.value || null }))}
                  style={{ flex: '1 1 140px', padding: '14px', borderRadius: '14px', border: '2px solid #ff80ab', minWidth: '100px' }}
                >
                  <option value="">未分類</option>
                  {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>

                {/* ③ファイル再選択＋選択済み表示（完璧に動く！！） */}
                <label style={{ 
                  flex: '1 1 180px', 
                  background: selectedMemo.file_url ? '#ff4081' : '#ff80ab', 
                  color: 'white', 
                  padding: '14px 16px', 
                  borderRadius: '14px', 
                  cursor: 'pointer', 
                  textAlign: 'center',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  <FontAwesomeIcon icon="paperclip" /> {
                    selectedMemo.file_url 
                      ? `選択済み: ${selectedFile?.name || 'ファイル'}` 
                      : 'ファイル再選択'
                  }
                  <input 
                    type="file" 
                    onChange={async (e) => {
                      const file = e.target.files[0];
                      if (!file) return;
                      setSelectedFile(file);  // 表示用に名前更新
                      const url = await uploadFile(file);  // ←ここで直接渡す！！
                      if (url) {
                        setSelectedMemo(prev => ({ ...prev, file_url: url }));
                        alert(`「${file.name}」をアップロードしました！`);
                      }
                    }} 
                    accept="image/*,.pdf" 
                    style={{ display: 'none' }} 
                  />
                </label>
              </div>

              {/* 現在の添付ファイルがあればリンク表示 */}
              {selectedMemo.file_url && (
                <div style={{ textAlign: 'center', marginTop: '8px' }}>
                  <a href={selectedMemo.file_url} target="_blank" rel="noopener noreferrer" 
                     style={{ color: '#ff4081', fontWeight: 'bold', fontSize: '14px', textDecoration: 'underline' }}>
                    📎 現在の添付ファイルを開く
                  </a>
                </div>
              )}
            </div>

            {/* 操作ボタン（下までちゃんとスクロールできる！） */}
            <div style={{ marginTop: '30px', display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button onClick={updateMemo} style={{ background: '#ff4081', color: 'white', padding: '14px 30px', borderRadius: '30px', fontWeight: 'bold' }}>保存</button>
              <button onClick={() => deleteMemo(selectedMemo.id)} style={{ background: '#d32f2f', color: 'white', padding: '14px 30px', borderRadius: '30px' }}>削除</button>
              <button onClick={() => shareMemo(selectedMemo.id)} style={{ background: '#ff80ab', color: 'white', padding: '14px 30px', borderRadius: '30px' }}>共有</button>
              <button onClick={() => setSelectedMemo(null)} style={{ background: '#999', color: 'white', padding: '14px 30px', borderRadius: '30px' }}>閉じる</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;