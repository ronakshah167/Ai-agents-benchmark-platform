import {cohort} from './data.mjs';

export function compareAgents(leftSlug,rightSlug,rows){
  const byAgent=slug=>new Map(rows.filter(row=>row.agent_slug===slug).map(row=>[cohort(row),row]));
  const left=byAgent(leftSlug), right=byAgent(rightSlug);
  const shared=[],leftOnly=[],rightOnly=[];
  for(const [key,row] of left){
    if(right.has(key))shared.push([row,right.get(key)]);
    else leftOnly.push(row);
  }
  for(const [key,row] of right)if(!left.has(key))rightOnly.push(row);
  return {shared,leftOnly,rightOnly};
}
