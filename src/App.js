import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabase';
import { v4 as uuidv4 } from 'uuid';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
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
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
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

  // UUID有効判定関数
  const isValidUUID = (str) => {
    const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return regex.test(str);
  };

  // deviceId初期化
  useEffect(() => {
    let id = localStorage.getItem('deviceId');
    if (!id || id.trim() === '') {
      id = uuidv4();
      localStorage.setItem('deviceId', id);
    }
    // ← ここ削除！（UUIDじゃなくても通す！！！）
    // else if (!isValidUUID(id)) {
    //   id = uuidv4();
    //   localStorage.setItem('deviceId', id);
    // }
    setDeviceId(id);
  }, []);
  
  // createFolder（ここが重複の原因だったので1つに統一！）
  const createFolder = async () => {
    if (!newFolderName.trim()) return;
  
    // deviceIdが不正ならガード
    if (!deviceId || deviceId.trim() === '') {
      alert('デバイスIDが空です！アプリをリロードしてください！');
      return;
    }
  
    const { data, error } = await supabase
      .from('folders')
      .insert([{ 
        name: newFolderName.trim(), 
        device_id: deviceId 
      }])
      .select();
  
    if (error) {
      console.error('Error creating folder:', error);
      alert('フォルダ作成失敗: ' + error.message);
    } else {
      setNewFolderName('');
      if (data?.[0]) setFolders(prev => [...prev, data[0]]);
      fetchMemos();
    }
  };

  // データ取得
  useEffect(() => {
    if (deviceId) {
      fetchFolders();
      fetchMemos();
    }
  }, [deviceId, searchQuery, showTrash, selectedDate, folderSearchId]);
  
  useEffect(() => {
    document.documentElement.style.overflowX = 'hidden';
    document.body.style.overflowX = 'hidden';
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.width = '100vw';
    document.body.style.boxSizing = 'border-box';
    return () => {
      document.documentElement.style.overflowX = '';
      document.body.style.overflowX = '';
    };
  }, []);

  // メモ選択時に履歴リセット
  useEffect(() => {
    if (selectedMemo) {
      const initial = selectedMemo.text || '';
      setHistory([initial]);
      setHistoryIndex(0);
    }
  }, [selectedMemo?.id]);

  const scrollToInput = () => {
    document.querySelector('textarea')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

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

  const fetchFolders = async () => {
    const { data, error } = await supabase.from('folders').select('*').eq('device_id', deviceId);
    if (error) console.error('Error fetching folders:', error);
    else setFolders(data || []);
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

  const uploadFile = async (fileToUpload) => {
    const file = fileToUpload || selectedFile;
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
    if (error) {
      console.error('Error sharing memo:', error);
      alert('共有失敗');
      return;
    }
    const shareUrl = `${window.location.origin}/share/${id}`;
    const memoText = selectedMemo.text;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Cocotteメモ共有',
          text: memoText,
          url: shareUrl,
        });
        alert('共有しました！');
      } catch (err) {
        fallbackCopy(shareUrl, memoText);
      }
    } else {
      fallbackCopy(shareUrl, memoText);
    }
  };

  const fallbackCopy = async (url, text) => {
    try {
      await navigator.clipboard.writeText(`${url}\n\n${text}`);
      alert(`共有URLと全文をコピーしました！\n${url}`);
    } catch (err) {
      prompt('コピー失敗したので手動でコピーしてね！', `${url}\n\n${text}`);
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

  // changeDeviceIdも同じ！！！
  const changeDeviceId = () => {
    const newId = prompt('新しいデバイスIDを入力してね！（空欄でランダムUUID）:');
    if (newId === null) return;
  
    let finalId;
    if (!newId || newId.trim() === '') {
      finalId = uuidv4();
    } else {
      finalId = newId.trim().replace(/\s/g, '');
      if (finalId === '') {
        alert('空白だけはダメだよ！');
        return;
      }
    }
  
    localStorage.setItem('deviceId', finalId);
    setDeviceId(finalId);
    setSelectedFolderId('');
    setFolderSearchId('');
    fetchFolders();
    fetchMemos();
  
    // 即時alert！！！
    if (!isValidUUID(finalId)) {
      alert(`IDを「${finalId}」に変更したよ！\n古い形式でも使えるけど、安定するならUUIDがおすすめ！`);
    } else {
      alert('IDを変更したよ！データが切り替わった✨');
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
        regex.test(part) ? <mark key={i} style={{ background: t.main, color: 'white', borderRadius: '4px', padding: '0 3px' }}>{part}</mark> : part
      );
    } catch { return text; }
  };

  const getTitle = (text) => {
    const title = text.split('\n')[0] || '（無題）';
    return <span>{highlightText(title)}</span>;
  };

  const toggleSelectMemo = (id) => {
    setSelectedMemos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
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

  // loginWithId（setTimeout削除！即時alertに変更！）
  const loginWithId = () => {
    let input = loginInputId.trim();
    if (!input) return alert('IDを入力してね！');
  
    const cleaned = input.replace(/\s/g, '');
    if (cleaned === '') return alert('IDが空だよ！');
  
    localStorage.setItem('deviceId', cleaned);
    setDeviceId(cleaned);
    setShowLoginModal(false);
    setLoginInputId('');
    fetchFolders();
    fetchMemos();
  
    // 即時alertに変更！！！（setTimeoutが悪だった！！！）
    if (!isValidUUID(cleaned)) {
      alert(`ログインできたよ！✨\n\nでもこのID「${cleaned}」は古い形式だよ～\n今後安定して使うなら、メニューから「ID変更」で新しいUUIDに変えてね！`);
    } else {
      alert('ログイン成功！データが同期されたよ✨');
    }
  };

  const charCount = selectedMemo ? selectedMemo.text.length : 0;

  return (
    <div style={{ 
      backgroundColor: t.bg, 
      color: t.text,
      minHeight: '100vh', 
      padding: '20px', 
      fontFamily: 'Arial, sans-serif', 
      boxSizing: 'border-box' 
    }}>

      {/* タイトルバー */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ 
          background: `linear-gradient(135deg, ${t.main}, ${t.dark})`, 
          padding: '16px 32px', 
          borderRadius: '40px', 
          boxShadow: `0 8px 20px ${t.dark}55, inset 0 0 20px rgba(255,255,255,0.3)`,
          border: '6px solid #fff',
          position: 'relative',
          display: 'inline-block'
        }}>
          <div style={{
            position: 'absolute',
            top: '-12px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: t.main,
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

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button 
            onClick={() => setShowHelp(true)} 
            style={{ 
              background: t.main, 
              color: 'white', 
              border: 'none', 
              padding: isMobile ? '14px' : '12px 20px', 
              borderRadius: '50%', 
              fontSize: '20px', 
              cursor: 'pointer', 
              boxShadow: `0 6px 18px ${t.dark}4d`,
              minWidth: isMobile ? '50px' : 'auto',
              height: '50px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <FontAwesomeIcon icon="question" />
            {!isMobile && <span style={{ marginLeft: '8px', fontSize: '16px' }}>使い方</span>}
          </button>

          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowMenu(!showMenu)} style={{ 
              background: t.main, color: 'white', border: 'none', padding: '12px', borderRadius: '50%', width: '50px', height: '50px', fontSize: '24px', cursor: 'pointer'
            }}>
              <FontAwesomeIcon icon="bars" />
            </button>
            {showMenu && (
              <div style={{ 
                position: 'absolute', right: 0, top: '60px', background: 'white', borderRadius: '20px', 
                boxShadow: `0 10px 30px ${t.dark}66`, padding: '15px', zIndex: 9999, minWidth: '220px', border: `2px solid ${t.light}`
              }}>
                <div style={{ fontWeight: 'bold', color: t.dark, marginBottom: '10px' }}>テーマ変更</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '15px' }}>
                  <button onClick={() => {setTheme('pink'); setShowMenu(false)}} style={{ background: '#ff80ab', color: 'white', padding: '10px', borderRadius: '12px' }}>ピンク</button>
                  <button onClick={() => {setTheme('blue'); setShowMenu(false)}} style={{ background: '#64b5f6', color: 'white', padding: '10px', borderRadius: '12px' }}>ブルー</button>
                  <button onClick={() => {setTheme('green'); setShowMenu(false)}} style={{ background: '#81c784', color: 'white', padding: '10px', borderRadius: '12px' }}>グリーン</button>
                  <button onClick={() => {setTheme('dark'); setShowMenu(false)}} style={{ background: '#757575', color: 'white', padding: '10px', borderRadius: '12px' }}>ダーク</button>
                </div>
                <button onClick={() => {changeDeviceId(); setShowMenu(false)}} style={{ width: '100%', background: t.light, color: t.dark, padding: '10px', borderRadius: '12px', marginBottom: '8px' }}>ID変更</button>
                <button onClick={() => {setShowLoginModal(true); setShowMenu(false)}} style={{ width: '100%', background: t.light, color: t.dark, padding: '10px', borderRadius: '12px', marginBottom: '8px' }}>ログイン</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* デバイスID表示 */}
      <div style={{ marginBottom: '20px', padding: '16px 20px', background: t.light, borderRadius: '20px', boxShadow: `0 6px 18px ${t.dark}33`, textAlign: 'center' }}>
        <p style={{ margin: '0 0 8px 0', fontSize: '15px', color: t.dark, fontWeight: 'bold' }}>デバイスID</p>
        <p style={{ margin: 0, fontFamily: 'monospace', background: '#fff', padding: '12px 16px', borderRadius: '14px', color: t.dark, fontWeight: 'bold', fontSize: '16px', wordBreak: 'break-all', lineHeight: '1.6' }}>
          {deviceId}
        </p>
        <button onClick={() => {
          navigator.clipboard.writeText(deviceId);
          alert('デバイスIDをコピーしたよ！（空白なし）');
        }} style={{ marginTop: '10px', background: t.main, color: 'white', padding: '8px 16px', borderRadius: '12px', fontSize: '14px' }}>
          コピー（空白なし）
        </button>
        <p style={{ margin: '8px 0 0', fontSize: '13px', color: t.dark }}>↑コピーボタンで安全にコピー！</p>
      </div>

      {/* メモ入力エリア */}
      <div style={{ 
        background: t.light, 
        padding: '20px', 
        borderRadius: '20px', 
        marginBottom: '20px', 
        boxShadow: `0 6px 20px ${t.dark}33`,
        maxWidth: '100%',
        overflow: 'hidden',
        boxSizing: 'border-box'
      }}>
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
            border: `3px solid ${t.main}`, 
            fontSize: '16px', 
            resize: 'vertical', 
            lineHeight: '1.8', 
            background: theme === 'dark' ? '#333' : 'white', 
            color: t.text,
            boxSizing: 'border-box'
          }} 
        />
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '15px', alignItems: 'center' }}>
          <select value={selectedColor} onChange={(e) => setSelectedColor(e.target.value)} style={{ flex: '1 1 120px', padding: '14px', borderRadius: '14px', border: `2px solid ${t.main}`, background: 'white', color: t.text }}>
            <option value="#ffffff">白</option>
            <option value="#ffe6f0">ピンク</option>
            <option value="#e3f2fd">水色</option>
            <option value="#e6ffe6">グリーン</option>
          </select>
          <select value={selectedFolderId} onChange={(e) => setSelectedFolderId(e.target.value)} style={{ flex: '1 1 140px', padding: '14px', borderRadius: '14px', border: `2px solid ${t.main}`, background: 'white', color: t.text }}>
            <option value="">未分類</option>
            {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <label style={{ flex: '1 1 180px', background: selectedFile ? t.dark : t.main, color: 'white', padding: '14px 16px', borderRadius: '14px', cursor: 'pointer', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <FontAwesomeIcon icon="paperclip" /> {selectedFile ? `選択済み: ${selectedFile.name}` : 'ファイル選択'}
            <input type="file" onChange={handleFileChange} accept="image/*,.pdf" style={{ display: 'none' }} />
          </label>
          <input type="text" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="新フォルダ名" style={{ flex: '1 1 160px', padding: '14px', borderRadius: '14px', border: `2px solid ${t.main}`, background: 'white', color: t.text }} />
          <button onClick={createFolder} style={{ background: t.main, color: 'white', padding: '14px 20px', borderRadius: '30px', fontWeight: 'bold' }}>作成</button>
          <button onClick={addMemo} style={{ background: t.dark, color: 'white', padding: '14px 28px', borderRadius: '30px', fontWeight: 'bold' }}>追加</button>
        </div>
      </div>

      {/* 検索バー */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '12px 0 30px 0', background: t.light, padding: '12px', borderRadius: '18px', boxShadow: `0 4px 15px ${t.dark}26`, flexWrap: 'wrap' }}>
        <FontAwesomeIcon icon="search" style={{ color: t.main, fontSize: '20px' }} />
        <select value={searchType} onChange={(e) => { setSearchType(e.target.value); setSearchQuery(''); setSelectedDate(null); setFolderSearchId(''); }} style={{ padding: '10px', border: `2px solid ${t.main}`, borderRadius: '12px', background: 'white', color: t.text }}>
          <option value="text">文字</option>
          <option value="date">日付</option>
          <option value="folder">フォルダ</option>
        </select>
        {searchType === 'text' && <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="メモを検索..." style={{ flex: '1 1 200px', padding: '10px', border: `2px solid ${t.main}`, borderRadius: '12px', background: 'white', color: t.text }} />}
        {searchType === 'date' && <DatePicker selected={selectedDate} onChange={setSelectedDate} dateFormat="yyyy/MM/dd" placeholderText="日付を選択" className="date-picker" style={{ flex: '1 1 200px', padding: '10px', border: `2px solid ${t.main}`, borderRadius: '12px', background: 'white', color: t.text }} />}
        {searchType === 'folder' && (
          <select value={folderSearchId} onChange={(e) => setFolderSearchId(e.target.value)} style={{ flex: '1 1 200px', padding: '10px', border: `2px solid ${t.main}`, borderRadius: '12px', background: 'white', color: t.text }}>
            <option value="">全てのフォルダ</option>
            {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        )}
        <button onClick={fetchMemos} style={{ padding: '10px 16px', background: t.main, color: 'white', borderRadius: '12px' }}>検索</button>
      </div>

      {/* 操作ボタン */}
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
        <button onClick={bulkDelete} style={{ background: '#d32f2f', color: 'white', margin: '12px 0', padding: '10px 20px', borderRadius: '28px' }}>
          選択した {selectedMemos.size} 件を削除
        </button>
      )}

      {/* スマホ用固定追加ボタン */}
      <button onClick={scrollToInput} style={{
        position: 'fixed', right: '20px', bottom: '20px', background: t.dark, color: 'white',
        width: '64px', height: '64px', borderRadius: '50%', fontSize: '32px',
        boxShadow: `0 6px 25px ${t.dark}88`, zIndex: 1000, border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <FontAwesomeIcon icon="plus" />
      </button>

      <h2 style={{ color: t.dark, margin: '20px 0 10px' }}>{showTrash ? 'ゴミ箱' : 'メモ一覧'}</h2>

      <DragDropContext onDragEnd={onDragEnd}>
        {!showTrash && (
          <div>
            {folders.map((folder) => {
              const folderMemos = memos.filter((m) => m.folder_id === folder.id);
              const isOpen = openFolders[folder.id] || false;
      
              return (
                <div key={folder.id} style={{ marginBottom: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', background: t.light, padding: '10px', borderRadius: '12px', boxShadow: `0 3px 10px ${t.dark}26` }}>
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
                                <li
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  onClick={() => {
                                    if (!isSelectMode) setSelectedMemo(memo);
                                  }}
                                  style={{
                                    ...provided.draggableProps.style,
                                    backgroundColor: memo.color,
                                    padding: '12px',
                                    margin: '6px 0',
                                    borderRadius: '12px',
                                    cursor: isSelectMode ? 'default' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    color: t.dark,
                                    boxShadow: snapshot.isDragging ? `0 12px 28px ${t.main}77` : '0 2px 8px rgba(0,0,0,0.1)',
                                    position: 'relative',
                                    overflow: 'hidden',
                                    transition: snapshot.isDragging ? 'none' : 'all 0.25s ease',
                                    transform: snapshot.isDragging ? provided.draggableProps.style?.transform : 'none',
                                  }}
                                >
                                  {isSelectMode && (
                                    <input type="checkbox" checked={selectedMemos.has(memo.id)} onChange={() => toggleSelectMemo(memo.id)} onClick={(e) => e.stopPropagation()} style={{ marginRight: '10px', accentColor: t.main }} />
                                  )}
                                  <div
                                    {...provided.dragHandleProps}
                                    style={{
                                      position: 'absolute',
                                      left: 0,
                                      top: 0,
                                      width: '36px',
                                      height: '100%',
                                      background: snapshot.isDragging ? `linear-gradient(90deg, ${t.main}88, transparent)` : `linear-gradient(90deg, ${t.main}44, transparent)`,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor: 'grab',
                                      opacity: 1,
                                      transition: 'background 0.2s ease',
                                      borderRadius: '12px 0 0 12px',
                                      zIndex: 10,
                                    }}
                                  >
                                    <div style={{
                                      width: '18px',
                                      height: '36px',
                                      borderRadius: '6px',
                                      background: 
                                        theme === 'pink' ? `repeating-linear-gradient(90deg, ${t.dark} 0px, transparent 5px, ${t.dark} 10px)`
                                        : theme === 'blue' ? `repeating-linear-gradient(90deg, ${t.dark} 0px, transparent 4px, ${t.dark} 8px)`
                                        : theme === 'green' ? `repeating-linear-gradient(90deg, ${t.dark} 0px, transparent 6px, ${t.dark} 12px)`
                                        : `repeating-linear-gradient(90deg, #bbb 0px, transparent 4px, #bbb 8px)`,
                                      boxShadow: snapshot.isDragging ? `0 0 16px ${t.main}` : 'none',
                                      transition: 'all 0.2s ease',
                                    }} />
                                  </div>
      
                                  <strong style={{ marginLeft: '40px', flex: 1, fontSize: '16px' }}>
                                    {getTitle(memo.text)}
                                  </strong>
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
      
            {/* 未分類 */}
            <div>
              <div onClick={() => setIsOpenUncategorized(!isOpenUncategorized)} style={{ background: t.light, padding: '10px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', color: t.dark, boxShadow: `0 3px 10px ${t.dark}26` }}>
                未分類 ({memos.filter(m => !m.folder_id).length})
              </div>
      
              {isOpenUncategorized && (
                <Droppable droppableId="uncategorized">
                  {(provided) => (
                    <ul {...provided.droppableProps} ref={provided.innerRef} style={{ listStyle: 'none', padding: 0, margin: '8px 0' }}>
                      {memos.filter(m => !m.folder_id).map((memo, index) => (
                        <Draggable key={String(memo.id)} draggableId={String(memo.id)} index={index}>
                          {(provided, snapshot) => (
                            <li
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              onClick={() => {
                                if (!isSelectMode) setSelectedMemo(memo);
                              }}
                              style={{
                                ...provided.draggableProps.style,
                                backgroundColor: memo.color,
                                padding: '12px',
                                margin: '6px 0',
                                borderRadius: '12px',
                                cursor: isSelectMode ? 'default' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                color: t.dark,
                                boxShadow: snapshot.isDragging 
                                  ? `0 12px 28px ${t.main}77` 
                                  : '0 2px 8px rgba(0,0,0,0.1)',
                                position: 'relative',
                                overflow: 'hidden',
                                transition: snapshot.isDragging ? 'none' : 'all 0.25s ease',
                                transform: snapshot.isDragging ? provided.draggableProps.style?.transform : 'none',
                              }}
                            >
                              <div
                                {...provided.dragHandleProps}
                                style={{
                                  position: 'absolute',
                                  left: 0,
                                  top: 0,
                                  width: '36px',
                                  height: '100%',
                                  background: snapshot.isDragging 
                                    ? `linear-gradient(90deg, ${t.main}88, transparent)` 
                                    : `linear-gradient(90deg, ${t.main}44, transparent)`,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'grab',
                                  opacity: 1,
                                  transition: 'background 0.2s ease',
                                  borderRadius: '12px 0 0 12px',
                                  zIndex: 10,
                                }}
                              >
                                <div style={{
                                  width: '18px',
                                  height: '36px',
                                  borderRadius: '6px',
                                  background: 
                                    theme === 'pink' ? `repeating-linear-gradient(90deg, ${t.dark} 0px, transparent 5px, ${t.dark} 10px)`
                                    : theme === 'blue' ? `repeating-linear-gradient(90deg, ${t.dark} 0px, transparent 4px, ${t.dark} 8px)`
                                    : theme === 'green' ? `repeating-linear-gradient(90deg, ${t.dark} 0px, transparent 6px, ${t.dark} 12px)`
                                    : `repeating-linear-gradient(90deg, #bbb 0px, transparent 4px, #bbb 8px)`,
                                  boxShadow: snapshot.isDragging ? `0 0 16px ${t.main}` : 'none',
                                  transition: 'all 0.2s ease',
                                }} />
                              </div>
                            
                              {isSelectMode && (
                                <input
                                  type="checkbox"
                                  checked={selectedMemos.has(memo.id)}
                                  onChange={() => toggleSelectMemo(memo.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{
                                    marginLeft: '40px',
                                    marginRight: '10px',
                                    accentColor: t.main
                                  }}
                                />
                              )}
                            
                              <strong style={{
                                marginLeft: isSelectMode ? '0px' : '40px',
                                flex: 1,
                                fontSize: '16px'
                              }}>
                                {getTitle(memo.text)}
                              </strong>
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
            <li key={memo.id} style={{ backgroundColor: memo.color, padding: '12px', margin: '6px 0', borderRadius: '8px', display: 'flex', alignItems: 'center', color: t.dark, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
              {isSelectMode && (
                <input type="checkbox" checked={selectedMemos.has(memo.id)} onChange={() => toggleSelectMemo(memo.id)} onClick={(e) => e.stopPropagation()} style={{ marginRight: '10px', accentColor: t.main }} />
              )}
              <strong>{getTitle(memo.text)}</strong>
              <button onClick={() => restoreMemo(memo.id)} style={{ marginLeft: 'auto', background: t.main, color: 'white', padding: '8px 14px', borderRadius: '20px' }}>復元</button>
            </li>
          ))}
        </ul>
      )}

      {/* ログイン */}
      {showLoginModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(255,182,193,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: '25px', padding: '25px', maxWidth: '420px', width: '90%', boxShadow: `0 15px 40px ${t.dark}66` }}>
            <h3 style={{ color: t.dark, textAlign: 'center' }}>ログイン方法</h3>
            <input type="text" value={loginInputId} onChange={(e) => setLoginInputId(e.target.value)} placeholder="デバイスIDを入力" style={{ width: '100%', padding: '12px', border: `2px solid ${t.main}`, borderRadius: '14px', marginBottom: '10px' }} />
            <button onClick={loginWithId} style={{ width: '100%', padding: '12px', background: t.main, color: 'white', borderRadius: '25px', marginBottom: '10px' }}>IDでログイン</button>
            <button onClick={() => setShowLoginModal(false)} style={{ width: '100%', padding: '12px', background: '#ccc', color: 'white', borderRadius: '25px' }}>キャンセル</button>
          </div>
        </div>
      )}

      {/* ヘルプ */}
      {showHelp && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(255,182,193,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: '25px', padding: '25px', maxWidth: '520px', width: '90%', boxShadow: `0 15px 40px ${t.dark}66`, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ color: t.dark, textAlign: 'center', marginBottom: '20px' }}>Cocotte の使い方</h3>
            <p style={{ color: t.dark, fontSize: '14px', lineHeight: '1.9' }}>
              <strong>・メモ追加</strong>: テキスト入力 → 色・フォルダ → 「追加」<br/>
              <strong>・Undo/Redo</strong>: 編集中に Ctrl+Z / Ctrl+Y<br/>
              <strong>・検索</strong>: 文字 / 日付 / フォルダ<br/>
              <strong>・共有</strong>: 詳細 → 共有 → URLコピー<br/>
              <strong>・ログイン</strong>: ID入力 <br/><br/>
              
              <strong style={{ color: '#d32f2f' }}>【重要】プライベートモードについて</strong><br/>
              シークレットモードやプライベートブラウジングだと<br/>
              「ID変更」や「ブラウザ更新」でIDがリセットされることがあります！<br/>
              <strong>→ 別の場所（メモ帳やスクショ）にデバイスIDを保存しておくのが超おすすめ！</strong><br/>
              （PWA化しても念のため保存しとくと安心）<br/><br/>
      
              <strong style={{ color: '#ff4081' }}>【超便利】PWAでアプリ化しよう！</strong><br/>
              Safari（iPhone）やChromeなど（Android）からならホーム画面に追加すると<br/>
              → ブラウザ開かずにワンタップで起動できるよ！<br/>
            </p>
            <button onClick={() => setShowHelp(false)} style={{ background: t.main, color: 'white', padding: '14px 28px', borderRadius: '30px', margin: '20px auto 0', display: 'block', fontWeight: 'bold' }}>閉じる</button>
          </div>
        </div>
      )}

      {/* メモ詳細モーダル */}
      {selectedMemo && (
        <div style={{ 
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: `${t.main}ee`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px',
          boxSizing: 'border-box'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '32px',
            padding: '24px 20px',
            width: '100%',
            maxWidth: '560px',
            minWidth: '280px',
            maxHeight: '92vh',
            overflowY: 'auto',
            overflowX: 'hidden',
            boxShadow: `0 30px 80px ${t.dark}aa`,
            boxSizing: 'border-box',
            msOverflowStyle: 'none',
            scrollbarWidth: 'none',
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <style jsx>{`
              div::-webkit-scrollbar { display: none !important; }
            `}</style>

            <button onClick={() => setSelectedMemo(null)} style={{ 
              alignSelf: 'flex-end', 
              background: '#999', 
              color: 'white', 
              padding: '8px 16px', 
              borderRadius: '20px', 
              fontSize: '14px',
              marginBottom: '12px'
            }}>
              ✕ 閉じる
            </button>

            <h3 style={{ color: t.dark, textAlign: 'center', margin: '0 0 18px', fontSize: '22px' }}>
              {highlightText(selectedMemo.text.split('\n')[0] || '（無題）')}
            </h3>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginBottom: '16px' }}>
              <button onClick={undo} disabled={historyIndex <= 0} style={{ 
                background: historyIndex <= 0 ? t.light : t.main, 
                color: 'white', padding: '14px 18px', borderRadius: '50%', fontSize: '22px' 
              }}>
                <FontAwesomeIcon icon="undo" />
              </button>
              <button onClick={redo} disabled={historyIndex >= history.length - 1} style={{ 
                background: historyIndex >= history.length - 1 ? t.light : t.main, 
                color: 'white', padding: '14px 18px', borderRadius: '50%', fontSize: '22px' 
              }}>
                <FontAwesomeIcon icon="redo" />
              </button>
            </div>
            <div style={{ textAlign: 'right', color: t.dark, fontWeight: 'bold', marginBottom: '8px', fontSize: '14px' }}>文字数: {charCount}</div>
            <textarea 
              ref={textareaRef} 
              value={selectedMemo.text} 
              onChange={(e) => { 
                setSelectedMemo(prev => ({ ...prev, text: e.target.value })); 
                addToHistory(e.target.value); 
              }} 
              rows="12" 
              style={{ width: '100%', padding: '16px', border: `3px solid ${t.main}`, borderRadius: '16px', fontSize: '16px', resize: 'vertical', lineHeight: '1.8', background: theme === 'dark' ? '#333' : 'white', color: t.text, boxSizing: 'border-box' }} 
            />
            <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                <select value={selectedMemo.color} onChange={(e) => setSelectedMemo(prev => ({ ...prev, color: e.target.value }))} style={{ flex: '1 1 120px', padding: '14px', borderRadius: '14px', border: `2px solid ${t.main}`, background: 'white', color: t.text }}>
                  <option value="#ffffff">白</option>
                  <option value="#ffe6f0">ピンク</option>
                  <option value="#e3f2fd">水色</option>
                  <option value="#e6ffe6">グリーン</option>
                </select>
                <select value={selectedMemo.folder_id || ''} onChange={(e) => setSelectedMemo(prev => ({ ...prev, folder_id: e.target.value || null }))} style={{ flex: '1 1 140px', padding: '14px', borderRadius: '14px', border: `2px solid ${t.main}`, background: 'white', color: t.text }}>
                  <option value="">未分類</option>
                  {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                <label style={{ flex: '1 1 180px', background: selectedMemo.file_url ? t.dark : t.main, color: 'white', padding: '14px 16px', borderRadius: '14px', cursor: 'pointer', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <FontAwesomeIcon icon="paperclip" /> {selectedMemo.file_url ? `選択済み: ${selectedFile?.name || 'ファイル'}` : 'ファイル再選択'}
                  <input type="file" onChange={async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    setSelectedFile(file);
                    const url = await uploadFile(file);
                    if (url) {
                      setSelectedMemo(prev => ({ ...prev, file_url: url }));
                      alert(`「${file.name}」をアップロードしました！`);
                    }
                  }} accept="image/*,.pdf" style={{ display: 'none' }} />
                </label>
              </div>
              {selectedMemo.file_url && (
                <div style={{ textAlign: 'center', marginTop: '8px' }}>
                  <a href={selectedMemo.file_url} target="_blank" rel="noopener noreferrer" style={{ color: t.dark, fontWeight: 'bold', textDecoration: 'underline' }}>
                    現在の添付ファイルを開く
                  </a>
                </div>
              )}
            </div>
            <div style={{ marginTop: '30px', display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button onClick={updateMemo} style={{ background: t.dark, color: 'white', padding: '14px 30px', borderRadius: '30px', fontWeight: 'bold' }}>保存</button>
              <button onClick={() => deleteMemo(selectedMemo.id)} style={{ background: '#d32f2f', color: 'white', padding: '14px 30px', borderRadius: '30px' }}>削除</button>
              <button onClick={() => shareMemo(selectedMemo.id)} style={{ background: t.main, color: 'white', padding: '14px 30px', borderRadius: '30px' }}>共有</button>
            </div>
          </div>
        </div>
      )}

      <footer style={{ 
        marginTop: '80px', 
        padding: '30px 20px', 
        textAlign: 'center', 
        fontSize: '12px', 
        color: t.text, 
        borderTop: `3px solid ${t.light}`, 
        background: t.bg,
        position: 'relative',
        zIndex: 1
      }}>
        <div style={{ marginBottom: '12px' }}>
          <a href="/privacy.html" target="_blank" rel="noopener noreferrer" style={{ color: t.main, margin: '0 18px', textDecoration: 'none', fontWeight: 'bold' }}>
            プライバシーポリシー
          </a>
          <a href="/terms.html" target="_blank" rel="noopener noreferrer" style={{ color: t.main, margin: '0 18px', textDecoration: 'none', fontWeight: 'bold' }}>
            利用規約
          </a>
        </div>
        <p style={{ margin: '10px 0', fontSize: '11px', opacity: 0.8 }}>
          © 2025 もふみつ Cocotte All Rights Reserved.
        </p>
      </footer>
    </div>
  );
}

export default App;