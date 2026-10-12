export function ProductSpecs({rows,caption}:{rows:readonly {label:string;value:string}[];caption:string}) {
 return <table className="product-specs"><caption>{caption}</caption><tbody>{rows.map(row=><tr key={row.label}><th scope="row">{row.label}</th><td>{row.value}</td></tr>)}</tbody></table>;
}
