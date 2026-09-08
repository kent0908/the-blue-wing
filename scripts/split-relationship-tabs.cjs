const fs=require('fs');const p='components/CharacterChat.tsx';let s=fs.readFileSync(p,'utf8');s=s.replace('import CompanionIdleStage from "./CompanionIdleStage";','import CompanionIdleStage from "./CompanionIdleStage";\nimport RelationshipStages from "./RelationshipStages";');s=s.replace('  const [personaOpen, setPersonaOpen] = useState(false);','  const [personaOpen, setPersonaOpen] = useState(false);\n  const [relationshipOpen, setRelationshipOpen] = useState(true);');const a=s.indexOf('        <nav className={styles.mobileTabs}');const b=s.indexOf('</nav>',a)+6;s=s.slice(0,a)+`        <nav className={styles.mobileTabs} aria-label="陪聊設定">
          <button type="button" onClick={() => { setScenesOpen(true); setPersonaOpen(false); setRelationshipOpen(true); }}>關係階段</button>
          <button type="button" onClick={() => { setScenesOpen(true); setPersonaOpen(false); setRelationshipOpen(false); }}>解鎖場景</button>
          <button type="button" onClick={() => { setScenesOpen(true); setPersonaOpen(true); setRelationshipOpen(false); }}>我的身分</button>
        </nav>`+s.slice(b);const c=s.indexOf('          <div className={styles.tabs}>');const d=s.indexOf('          {personaOpen &&',c);s=s.slice(0,c)+`          <div className={styles.tabs}>
            <button type="button" aria-pressed={relationshipOpen} onClick={() => { setRelationshipOpen(true); setPersonaOpen(false); }}>關係階段</button>
            <button type="button" aria-pressed={!personaOpen && !relationshipOpen} onClick={() => { setRelationshipOpen(false); setPersonaOpen(false); }}>解鎖場景</button>
            <button type="button" aria-pressed={personaOpen} onClick={() => { setPersonaOpen(true); setRelationshipOpen(false); }}>我的身分</button>
          </div>
          <button type="button" className="shrink-0 border-b border-white/10 px-4 py-2 text-left text-xs text-[#a2bcb2]" onClick={() => setEditing(true)}>編輯角色設定</button>
          {relationshipOpen && <div className="min-h-0 flex-1 overflow-y-auto"><div className="flex justify-end px-3 pt-2 lg:hidden"><button type="button" onClick={() => setScenesOpen(false)} aria-label="關閉設定">關閉</button></div><RelationshipStages affection={character.affection ?? 0} /></div>}
`+s.slice(d);s=s.replace('hidden={personaOpen}','hidden={personaOpen || relationshipOpen}');fs.writeFileSync(p,s);
