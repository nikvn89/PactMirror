import { abi } from 'genlayer-js'
const { calldata, transactions } = abi
const PID='a'.repeat(64)
const size=(m,a)=>{const s=transactions.serialize([calldata.encode({method:m,args:a}),false]);return (s.length-2)/2}
const rows={
"K1 (mirrored, collective term)":"Each side is free to end this agreement on thirty days written notice.",
"K2 (not mirrored, scope asymmetry)":"The Provider may terminate on thirty days notice; the Customer may terminate the hosting module alone.",
"TX2 (not mirrored, extra route)":"Either party may terminate on thirty days written notice. The Provider may also terminate immediately at its own discretion.",
"TX4 (mirrored, routes closed)":"Either party may terminate on thirty days written notice. Neither party has any other right to terminate.",
}
for(const [k,v] of Object.entries(rows)){const n=size('submit_term',[PID,v]);console.log(`${String(v.length).padStart(4)} ch  ${String(n).padStart(4)} B  ${n>255?'OVER 255':'ok      '}  ${k}`)}
console.log(`\ncreate_pact demo: ${size('create_pact',['Hosting pact','0x'+'b'.repeat(40),'Provider','Customer','termination on thirty days written notice'])} B`)
