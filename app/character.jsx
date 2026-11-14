export default function Character({color = '#ca7e60', delay = '0s'}) {
 return <svg className="guide-character" width="72" height="64" viewBox="0 0 72 64" style={{'--character-delay':delay}} aria-hidden="true" focusable="false"><path fill={color} d="M12 10h48v18h8v16h-8v10h-8v-9h-8v9h-8v-9h-8v9h-8V44H4V28h8z"/><path fill="#fff9fb" d="M23 20h6v11h-6zm20 0h6v11h-6z"/></svg>;
}
