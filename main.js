function appendHtml(parent, html) {
  const el = document.createElement("div");
  el.innerHTML = html;
  parent.appendChild(el);
}

const omit = (object, properties) =>
  Object.keys(object)
    .filter((key) => !properties.includes(key))
    .reduce((filteredObject, key) => {
      filteredObject[key] = object[key];
      return filteredObject;
    }, {});

const syncCookies = ({ names, originDomain, targetDomain }, callback) => {
  try {
    chrome.cookies.getAll({}, (cookies) => {
      const cookiesToSync = cookies.filter(
        (cookie) =>
          cookie.domain === originDomain && names.includes(cookie.name)
      );

      let doneCount = 0;

      cookiesToSync.forEach((cookie) => {
        try {
          const newCookie = Object.assign(
            {},
            omit(cookie, ["hostOnly", "session"]),
            {
              url:
                (targetDomain === "localhost" ? "http://" : "https://") +
                targetDomain,
              domain: targetDomain,
              secure: targetDomain !== "localhost",
            }
          );
          chrome.cookies.set(newCookie, (written) => {
            if (written) return;
            callback(new Error(JSON.stringify(newCookie, null, 2)));
            callback(chrome.runtime.lastError);
          });
          doneCount += 1;
        } catch (e) {
          callback(e);
        }
      });

      const wasSuccess = doneCount === cookiesToSync.length;

      if (!wasSuccess) {
        callback(new Error("Ops, something went wrong"));
        return;
      }
      callback(null);
    });
  } catch (e) {
    callback(e);
  }
};

let selectedCookieNames = [];

document.addEventListener(
  "DOMContentLoaded",
  () => {
    const originInput = document.getElementById("origin-input");
    const targetInput = document.getElementById("target-input");
    const button = document.getElementById("sync-button");
    const container = document.getElementById("content-container");

    const alert = (message) =>
      appendHtml(container, `<div>${JSON.stringify(message, null, 2)}</div>`);

    const reloadOriginCookies = (domain) => {
      const updateButton = ({ cookies, selectedCookieNames } = {}) => {
        const canSubmit =
          cookies.length !== 0 && selectedCookieNames.length !== 0;
        button.disabled = !canSubmit;
        button.textContent = canSubmit
          ? "Sync cookies"
          : cookies.length === 0
          ? "No cookies for this target domain"
          : "Select the cookies you want to sync";
      };

      chrome.cookies.getAll({}, (cookies) => {
        container.innerHTML = "";
        const originCookies = cookies.filter(
          (cookie) => cookie.domain === domain
        );

        originCookies.forEach((cookie) => {
          const el = document.createElement("button");
          el.textContent = cookie.name;
          el.classList.toggle(
            "is-selected",
            selectedCookieNames.includes(cookie.name)
          );

          el.addEventListener("click", () => {
            selectedCookieNames = selectedCookieNames.includes(cookie.name)
              ? selectedCookieNames.filter((n) => n !== cookie.name)
              : [...selectedCookieNames, cookie.name];
            el.classList.toggle(
              "is-selected",
              selectedCookieNames.includes(cookie.name)
            );
            updateButton({ cookies: originCookies, selectedCookieNames });
          });
          container.appendChild(el);
        });

        updateButton({ cookies: originCookies, selectedCookieNames });
      });
    };

    originInput.addEventListener("input", () => {
      reloadOriginCookies(originInput.value.trim());
    });

    button.addEventListener(
      "click",
      () => {
        try {
          if (!originInput.value || !targetInput.value) return;

          button.innerHTML = "...";

          chrome.storage.sync.set(
            {
              "origin-domain": originInput.value,
              "target-domain": targetInput.value,
              "cookie-names": selectedCookieNames.join(","),
            },
            () => {
              if (!chrome.runtime.lastError) return;
              alert(`Error: ${chrome.runtime.lastError}`);
            }
          );

          syncCookies(
            {
              names: selectedCookieNames,
              originDomain: originInput.value,
              targetDomain: targetInput.value,
            },
            (error) => {
              if (error) {
                alert(`Error: ${error.message}`);
                button.innerHTML = "Error syncing cookies!";
                return;
              }
              button.innerHTML = "Cookies synced!";
            }
          );
        } catch (e) {
          alert(`Error: ${e.message}`);
        }
      },
      false
    );

    try {
      chrome.storage.sync.get(
        ["origin-domain", "target-domain", "cookie-names"],
        (payload) => {
          originInput.value = payload["origin-domain"] || "";
          targetInput.value = payload["target-domain"] || "";
          selectedCookieNames = payload["cookie-names"]
            ? payload["cookie-names"].split(",")
            : [];
          reloadOriginCookies(originInput.value.trim());
        }
      );
    } catch (e) {
      alert(`Error: ${e.message}`);
    }
  },
  false
);

// chrome.cookies.onChanged.addListener(payload => {
//   if (payload.cause !== "explicit") return;

//   try {
//     chrome.storage.sync.get(["origin-domain", "target-domain"], payload => {
//       if (!payload["origin-domain"] || !payload["target-domain"]) return;
//       if (payload.cookie.domain !== payload["origin-domain"]) return;

//       syncCookies(
//         {
//           originDomain: payload["origin-domain"],
//           targetDomain: payload["target-domain"]
//         },
//         error => {
//           if (error) {
//             console.log(error.message);
//             return;
//           }
//           console.log("Synced cookies");
//         }
//       );
//     });
//   } catch (e) {
//     console.log(`Error: ${e.message}`);
//   }
// });
