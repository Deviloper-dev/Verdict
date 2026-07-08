module.exports=[8844,a=>a.a(async(b,c)=>{try{let b=await a.y("pg-4c0d8067d674414d");a.n(b),c()}catch(a){c(a)}},!0),97115,a=>{"use strict";async function b(a,b){let{rows:c}=await a.query(`select g.id, g.name,
            (select count(*)::int from group_members where group_id = g.id) as member_count,
            (select count(*)::int from polls p where p.group_id = g.id and p.status = 'open') as open_polls,
            (select count(*)::int from records r where r.group_id = g.id) as record_count
       from groups g
       join group_members gm on gm.group_id = g.id and gm.member_id = $1
      order by g.created_at`,[b]);return c}async function c(a,b,c){return(await a.query("select 1 from group_members where group_id = $1 and member_id = $2",[b,c])).rows.length>0}async function d(a,b,d){if(!await c(a,b,d))return null;let e=await a.query("select id, name from groups where id = $1",[b]);if(0===e.rows.length)return null;let f=await a.query(`select gm.member_id, m.name, m.email
       from group_members gm join members m on m.id = gm.member_id
      where gm.group_id = $1 order by m.name`,[b]),g=await a.query(`select p.id, p.title, p.status, p.quorum_percent, p.created_at::text,
            (select count(*)::int from participants where poll_id = p.id) as participant_count,
            (select count(*)::int from votes where poll_id = p.id) as vote_count,
            exists(select 1 from participants pp where pp.poll_id = p.id and pp.member_id = $2) as i_am_participant,
            exists(select 1 from votes v join participants pp on pp.id = v.participant_id
                    where v.poll_id = p.id and pp.member_id = $2) as i_have_voted,
            (select seq from records r where r.poll_id = p.id) as record_seq
       from polls p
      where p.group_id = $1 and p.status <> 'withdrawn'
      order by (p.status = 'open') desc, p.created_at desc`,[b,d]),h=await a.query("select count(*)::int as n from records where group_id = $1",[b]);return{id:e.rows[0].id,name:e.rows[0].name,members:f.rows,polls:g.rows,record_count:h.rows[0].n}}async function e(a,b,d){let e=await a.query(`select p.id, p.group_id, g.name as group_name, p.created_by, m.name as creator_name,
            p.title, p.context, p.quorum_percent, p.status
       from polls p join groups g on g.id = p.group_id join members m on m.id = p.created_by
      where p.id = $1`,[b]);if(0===e.rows.length)return null;let f=e.rows[0];if(!await c(a,f.group_id,d))return null;let g=await a.query("select id, label from options where poll_id = $1 order by id",[b]),h=await a.query(`select pp.member_id, m.name,
            exists(select 1 from votes v where v.participant_id = pp.id) as has_voted
       from participants pp join members m on m.id = pp.member_id
      where pp.poll_id = $1 order by m.name`,[b]),i=await a.query(`select v.option_id, v.opinion_text as opinion
       from votes v join participants pp on pp.id = v.participant_id
      where v.poll_id = $1 and pp.member_id = $2`,[b,d]),j=await a.query("select seq from records where poll_id = $1",[b]);return{...f,options:g.rows,participants:h.rows,my_vote:i.rows[0]??null,i_am_participant:h.rows.some(a=>a.member_id===d),record_seq:j.rows[0]?.seq??null}}async function f(a,b,d){if(!await c(a,b,d))return null;let{rows:e}=await a.query(`select seq, poll_id, title, winning_option_id, options_snapshot, votes_snapshot,
            to_char(finalized_at at time zone 'UTC', 'DD Mon YYYY, HH24:MI UTC') as finalized_at,
            prev_hash, this_hash
       from records where group_id = $1 order by seq desc`,[b]);return e.map(a=>({seq:a.seq,poll_id:a.poll_id,title:a.title,winning_label:a.options_snapshot.find(b=>b.id===a.winning_option_id)?.label??"—",finalized_at:a.finalized_at,prev_hash:a.prev_hash,this_hash:a.this_hash,vote_count:a.votes_snapshot.length}))}async function g(a,b,d,e){if(!await c(a,b,e))return null;let{rows:f}=await a.query(`select seq, title, context, quorum_percent, winning_option_id,
            options_snapshot, participants_snapshot, votes_snapshot,
            to_char(finalized_at at time zone 'UTC', 'DD Mon YYYY, HH24:MI UTC') as finalized_at,
            prev_hash, this_hash
       from records where group_id = $1 and seq = $2`,[b,d]);if(0===f.length)return null;let g=f[0],h=g.options_snapshot,i=g.participants_snapshot,j=g.votes_snapshot,k=new Map(i.map(a=>[a.member_id,a.name])),l=new Map(h.map(a=>[a.id,a.label]));return{seq:g.seq,title:g.title,context:g.context,quorum_percent:g.quorum_percent,winning_label:l.get(g.winning_option_id)??"—",finalized_at:g.finalized_at,prev_hash:g.prev_hash,this_hash:g.this_hash,options:h.map(a=>({...a,votes:j.filter(b=>b.option_id===a.id).length})),participants:i,votes:j.map(a=>({name:k.get(a.participant_id)??a.participant_id,option_label:l.get(a.option_id)??"—",opinion:a.opinion,voted_at:a.voted_at}))}}a.s(["getGroupDetail",0,d,"getPollView",0,e,"getRecordBySeq",0,g,"isGroupMember",0,c,"listGroupsForMember",0,b,"listRecordsForGroup",0,f])},25218,a=>a.a(async(b,c)=>{try{var d=a.i(22918),e=b([d]);[d]=e.then?(await e)():e,a.s([]),c()}catch(a){c(a)}},!1),56666,a=>a.a(async(b,c)=>{try{var d=a.i(25218),e=a.i(22918),f=b([d,e]);[d,e]=f.then?(await f)():f,a.s(["00750abc391426ca56a273c1bfabc36a6903da02b3",()=>e.signOutAction,"40d34f21bf7de89a5a18136d89e7e24e312b00de7f",()=>e.createGroupAction,"606d6a7b81aaf2ec58c71782cb583fbdf602c6e85b",()=>e.addMemberByEmailAction,"60c4f7cce4c319a10ca75a167981712449f0f570bd",()=>e.withdrawPollAction,"60c5bcae2d2d41fd2745f95c3e487fbc29f14f5f49",()=>e.createPollAction,"700f7dfb2f10dcd4c75ca23b091ed350210687213a",()=>e.castVoteAction,"70499e70ff3afeeb3b25cb84d8a98093c8419b0327",()=>e.addParticipantAction,"70dcc1645f3dabf8526d7ffa8ed444247ca9077f94",()=>e.removeParticipantAction]),c()}catch(a){c(a)}},!1),14590,a=>{a.v(b=>Promise.all(["server/chunks/ssr/src_lib_search_pipeline_ts_1b1_500._.js"].map(b=>a.l(b))).then(()=>b(66046)))},22557,a=>{a.v(b=>Promise.all(["server/chunks/ssr/src_lib_search_embedder_ts_1rvtkre._.js"].map(b=>a.l(b))).then(()=>b(86366)))},50236,a=>{a.v(a=>Promise.resolve().then(()=>a(34233)))}];

//# sourceMappingURL=%5Broot-of-the-server%5D__026727d._.js.map