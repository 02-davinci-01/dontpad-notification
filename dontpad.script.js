// const backendUrl = 'http://localhost:8080';
const backendUrl = 'https://api.dontpad.com';

const parsePathName = () => {
	const pathName = document.location.pathname;
	if (pathName.endsWith('/')) {
		return pathName.substring(0, pathName.lastIndexOf('/'));
	}

	return pathName;
}

const reenableDontpad = () => {
	const text = document.querySelector('#text');
	text.removeAttribute('disabled');
}

const disableDontpad = () => {
	const text = document.querySelector('#text');
	text.setAttribute('disabled', 'true');
}

const loadTurnstileCaptcha = () => {
	const script = document.createElement('script');
	script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
	script.async = true;
	document.head.appendChild(script);

	const overlay = document.createElement('captcha-overlay');
	const container = document.createElement('turnstile-container');
	container.id = 'cf-turnstile-container';
	overlay.appendChild(container);
	document.body.appendChild(overlay);

	const onTurnstileValidation = res => {
		const sessionToken = res['session-token'];
		if (sessionToken) localStorage.setItem('session-token', sessionToken)
			
		overlay.remove();
		reenableDontpad();

		dontpad.actionRunning = null;
	};

	script.onload = () => window.turnstile.render(container, {
		sitekey: '0x4AAAAAABii_IEZPZYuquES',
		callback: (token) => { post('validate-turnstile', { 'turnstile-token': token }, onTurnstileValidation, console.error) }
	});;
};

// const loadCaptcha = () => {
// 	const overlay = document.createElement('captcha-overlay');
// 	document.body.appendChild(overlay);

// 	const modal = document.createElement('captcha-modal');

// 	const message = document.createElement('p');
// 	message.className = 'captcha-message';
// 	message.textContent = 'Please check to keep spam robots away';

// 	const container = document.createElement('grecaptcha-container');
// 	modal.append(message, container);

// 	overlay.appendChild(modal);

// 	const onCaptchaValidation = (res) => {
// 		const sessionToken = res['session-token'];
// 		localStorage.setItem('session-token', sessionToken);

// 		overlay.remove();
// 		reenableDontpad();

// 		dontpad.actionRunning = null;
// 	}

// 	const renderRecaptcha = () => {
// 		if (typeof grecaptcha !== 'undefined' && typeof grecaptcha.render === 'function') {
// 			grecaptcha.render(container, {
// 				'sitekey': '6LdPrA4qAAAAAG_uMd7wogc3wCA71MwI_LPtFTTU',
// 				'callback': (captchaToken) => {
// 					post('validate-captcha', { 'captcha-token-v2': captchaToken }, onCaptchaValidation, console.error);
// 				}
// 			});
// 		} else {
// 			setTimeout(renderRecaptcha, 100); // Retry every 100 milliseconds
// 		}
// 	}

// 	renderRecaptcha();
// }

const captchaChallenge = () => {
	dontpad.actionRunning = 'CAPTCHA';
	disableDontpad();
	loadTurnstileCaptcha();
}

const dontpad = {

	TIME_TO_SAVE: 5000, // five seconds
	REQUEST_TIMEOUT: 10000,
	$text: null,
	lastSaveOrUpdate: 0,
	isLoaded: false,
	lastModified: 0,
	showAds: false,
	links: [],
	linksFetched: false,
	isDiscardingChanges: false,
	actionRunning: null,
	sessionToken: null,
	forceOverride: false,

	load: function () {
		dontpad.$text = $('#text');
		dontpad.$text.val(''); // Override browser autofill
		dontpad.setOnLoad();
		dontpad.setOnResizeEvent();
		dontpad.enableAutoSaveOrUpdate();
		dontpad.setSaveWarningBeforeExit();
		dontpad.setFocus();
		dontpad.resizeMenu();
		dontpad.$text.on('keydown', dontpad.allowTab);
	},

	allowTab: function (e) {
		var keyCode = e.keyCode || e.which;
		if (keyCode == 9) {
			e.preventDefault();
			dontpad.insertAtCaret('text', '\t');
		}
	},

	insertAtCaret: function (areaId, text) {
		var txtarea = document.getElementById(areaId);
		var scrollPos = txtarea.scrollTop;
		var strPos = 0;
		var br = ((txtarea.selectionStart || txtarea.selectionStart == '0') ? 'ff' : (document.selection ? 'ie' : false));
		if (br == 'ie') {
			txtarea.focus();
			var range = document.selection.createRange();
			range.moveStart('character', -txtarea.value.length);
			strPos = range.text.length;
		} else if (br == 'ff') strPos = txtarea.selectionStart;
		var front = (txtarea.value).substring(0, strPos);
		var back = (txtarea.value).substring(strPos, txtarea.value.length);
		txtarea.value = front + text + back;
		strPos = strPos + text.length;
		if (br == 'ie') {
			txtarea.focus();
			var range = document.selection.createRange();
			range.moveStart('character', -txtarea.value.length);
			range.moveStart('character', strPos);
			range.moveEnd('character', 0);
			range.select();
		} else if (br == 'ff') {
			txtarea.selectionStart = strPos;
			txtarea.selectionEnd = strPos;
			txtarea.focus();
		}
		txtarea.scrollTop = scrollPos;
	},

	isDirty: function () {
		return dontpad.isLoaded && (dontpad.savedText !== dontpad.$text.val());
	},

	saveOrUpdate: function () {
		if (dontpad.actionRunning) return;
		if (Date.now() - dontpad.lastSaveOrUpdate < dontpad.TIME_TO_SAVE) return;

		if (this.isDirty()) {
			this.save();
		} else if (!(document.hidden || document.msHidden || document.webkitHidden)) {
			this.update();
		}
	},

	showAdsIfReady: function () {
		handleAds(
			document.cookie.includes('policies-accepted=true')
			&& dontpad.linksFetched
			&& dontpad.pageHasAds
			&& dontpad.hasAdLength
		);
	},

	getValidCharactersCount: function () {
		let validCharactersCount = 0;
		const lines = dontpad.savedText.split(/\r\n|\r|\n/g);
		const finalLines = lines.slice(Math.max(0, lines.length - 20));
		finalLines.forEach(line => {
			const lineWithoutSpaces = line.replace(/ /g, '');
			validCharactersCount += lineWithoutSpaces.length;
		});

		return validCharactersCount;
	},

	getSessionToken: function () {
		return localStorage.getItem('session-token');
	},

	update: function () {
		dontpad.actionRunning = 'UPDATE';

		dontpad.lastSaveOrUpdate = Date.now();
		const data = { lastModified: dontpad.lastModified };
		const sessionToken = dontpad.getSessionToken();
		if (sessionToken) data['session-token'] = sessionToken;
		$.ajax({
			data: data,
			url: backendUrl + parsePathName() + '.body.json',
			contentType: 'application/x-www-form-urlencoded;charset=UTF-8',
			dataType: 'json',
			type: 'GET',
			success: function (result) {
				if (result && result.changed) {
					dontpad.$text.val(result.body);
					dontpad.savedText = dontpad.$text.val(); // Dont use result.body directly. Using the textarea value will resist any encoding changes
					dontpad.lastModified = result.lastModified;

					const minContentLength = 300;
					const validCharactersCount = dontpad.getValidCharactersCount();

					dontpad.hasAdLength = validCharactersCount > minContentLength;
					dontpad.pageHasAds = result.ads;

					dontpad.showAdsIfReady();
				}
				if (!dontpad.isLoaded) {
					dontpad.isLoaded = true;
					dontpad.$text.removeAttr('disabled');
					dontpad.$text.focus();
				}
				handleAnimation(ANIMATION_TYPE.UPDATE);
				dontpad.actionRunning = null;
			},
			error: function (err) {
				if (err.status === 429) {
					captchaChallenge();
					return;
				}

				if (err?.responseJSON?.error === 'nesting-limit-reached') {
					alert('Maximum subpage nesting levels exceeded.');

					return;
				}

				handleAnimation(ANIMATION_TYPE.RETRY);
				dontpad.actionRunning = null;
			},
			timeout: dontpad.REQUEST_TIMEOUT,
		});
	},

	save: function () {
		dontpad.actionRunning = 'SAVE';

		dontpad.lastSaveOrUpdate = Date.now();
		const text = dontpad.$text.val();
		const data = {
			text: text,
			lastModified: dontpad.lastModified,
			force: dontpad.forceOverride
		}
		const sessionToken = dontpad.getSessionToken();
		if (sessionToken) data['session-token'] = sessionToken;
		$.ajax({
			data: data,
			url: backendUrl + parsePathName(),
			contentType: 'application/x-www-form-urlencoded;charset=UTF-8',
			type: 'POST',
			dataType: 'json',
			success: function (result) {
				dontpad.lastModified = result;
				dontpad.savedText = text;

				handleAnimation(ANIMATION_TYPE.SAVE);

				dontpad.forceOverride = false;
				dontpad.actionRunning = null;
			},
			error: function (err) {
				if (err.status === 429) {
					captchaChallenge();
					return;
				}
				if (err?.responseJSON?.error === 'update-timestamp-mismatch') {
					renderOverrideModal();
					return;
				}
				if (dontpad.forceOverride) {
					alert('Unable to save your page at the moment. Please try again later.');
					dontpad.forceOverride = false;
				}

				handleAnimation(ANIMATION_TYPE.RETRY);
				dontpad.actionRunning = null;
			},
			timeout: dontpad.REQUEST_TIMEOUT,
		});
	},

	enableAutoSaveOrUpdate: function () {
		setInterval(function () { dontpad.saveOrUpdate(); }, 100);
	},

	setOnResizeEvent: function () {
		$(window).resize(this.resizeMenu);
	},

	resizeMenu: function () {
		var $menuDiv = $('#menu-div');
		positionAbsoluteElements();
		if ($menuDiv.find('li').length > 0) {
			$menuDiv.show();
			// applyMenuScroll();
			handleItemsOverflow();
		} else {
			$menuDiv.hide();
		}
	},

	setFocus: function () {
		this.$text.focus();
	},

	setSaveWarningBeforeExit: function () {
		window.addEventListener('beforeunload', (e) => {
			if (this.isDirty() && !dontpad.isDiscardingChanges) {
				const msg = 'You have unsaved changes. Do you want to leave?'; // Ignored by modern browsers
				(e || window.event).returnValue = msg; // Gecko + IE
				return msg; // Gecko + Webkit, Safari, Chrome etc.
			}
		});
	},

	setOnLoad: function () {
		$(window).load(function () {
			let pathname = document.location.pathname;

			if (pathname.endsWith('.zip')) {
				const iframe = document.createElement('iframe');
				iframe.style.display = 'none';
				document.body.appendChild(iframe);
				iframe.src = backendUrl + pathname;

				pathname = pathname.replace('.zip', '');
				window.history.pushState('', '', pathname);
			}

			const pathnameArray = pathname.split('/');
			let index = pathnameArray.length - 1;

			if (pathname.endsWith('/')) {
				index--;
			}

			const documentTitle = pathnameArray[index];
			document.querySelector('title').textContent = `${documentTitle} | Dontpad`;

			dontpad.menu.loadLinks();
		});
	}
};

dontpad.menu = {
	loadLinks: function () {
		$.ajax({
			url: backendUrl + parsePathName() + '.menu.json',
			dataType: 'json',
			success: function (result) {
				dontpad.menu.create(result);
				dontpad.linksFetched = true;
				dontpad.showAdsIfReady();
			},
			error: function (result) {
				if (result?.responseJSON?.error !== 'nesting-limit-reached') {
					setTimeout(() => dontpad.menu.loadLinks(), dontpad.TIME_TO_SAVE);
				}
			},
		});
	},

	create: function (links) {
		if (links.length > 0) {
			dontpad.links = links;
			var $menu = $('#menu');
			links.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
			$.each(links, function (index, link) {
				$menu.append(dontpad.menu.createItemFromPath(link));
			});
			// const observer = new ResizeObserver((_) => applyMenuScroll());
			// observer.observe(document.querySelector('#menu'));
		}
		dontpad.resizeMenu();
	},

	createItemFromPath: function (path) {
		const result = document.createElement('li');

		const a = document.createElement('a');
		a.href = dontpad.menu.removeDuplicateSlashs(document.location + '/' + path);
		a.textContent = path;

		result.appendChild(a);

		return result;
	},

	removeDuplicateSlashs: function (url) {
		return 'https://' + url.replace('https://', '').replace(/\/\//g, '\/');
	}

};

$(function () {
	dontpad.load();
});
