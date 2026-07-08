module.exports=[66046,a=>{"use strict";async function b(a,c,d=20){let e=await a.query(`select r.id, r.title, r.context, r.winning_option_id,
            r.options_snapshot, r.participants_snapshot, r.votes_snapshot
       from records r
       left join record_embeddings e on e.record_id = r.id
      where e.record_id is null
      order by r.finalized_at
      limit $1`,[d]);if(0===e.rows.length)return 0;try{let b=e.rows.map(a=>{var b;let c,d;return b={title:a.title,context:a.context,winning_option_id:a.winning_option_id,options_snapshot:a.options_snapshot,participants_snapshot:a.participants_snapshot,votes_snapshot:a.votes_snapshot},c=new Map(b.options_snapshot.map(a=>[a.id,a.label])),d=new Map(b.participants_snapshot.map(a=>[a.member_id,a.name])),[b.title,b.context,`Decided: ${c.get(b.winning_option_id)??""}`,...b.votes_snapshot.map(a=>`${d.get(a.participant_id)??"someone"} voted ${c.get(a.option_id)??""}: ${a.opinion}`)].filter(Boolean).join("\n")}),d=await c.embed(b);for(let c=0;c<e.rows.length;c++)await a.query(`insert into record_embeddings (record_id, content, embedding)
         values ($1, $2, $3::vector) on conflict (record_id) do nothing`,[e.rows[c].id,b[c],JSON.stringify(d[c])]);return e.rows.length}catch(a){return console.error("embedding pass failed (will retry on next pass):",a),0}}a.s(["embedPendingRecords",0,b],66046)}];

//# sourceMappingURL=src_lib_search_pipeline_ts_1b1_500._.js.map