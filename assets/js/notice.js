const id = new URLSearchParams(location.search).get("id");
if (/^[1-9][0-9]*$/.test(id || "")) location.replace(`/notices/${id}/`);
else location.replace("/404");
