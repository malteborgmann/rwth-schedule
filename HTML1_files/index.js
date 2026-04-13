rwthCalendar ={
	rowID:"rwthHooksCalendarButton",
    linkTextDE:"Kalender",  
	linkTextEN:"Calendar", 
	calenderLink: "app/desktop/#/pl/ui/$ctx/wbKalender.wbPerson",
	setup: function(){
		// the courses page does not have its own script, so this script is shared with many other pages
		// check if it is the course page 
		if(window.location.href.includes('student/courses')){
			// wait a second for html rendering
			// otherwise ul is null
			// better solution?
			setTimeout(function (){
				var ul=document.evaluate('//ul[@class="sidebar-nav"]',document).iterateNext();
				if(ul != null){
					var li = document.createElement("li");
					var a = document.createElement('a');
					// unable to read properties from above
					var linkText = document.createTextNode("Kalender");
					a.appendChild(linkText);
					a.id = "rwthHooksCalendarButton";
					a.title = "Calendar";
					a.href = "app/desktop/#/pl/ui/$ctx/wbKalender.wbPerson";
					li.appendChild(a);
					ul.appendChild(li);
				}
			}, 1000);
			
		}
		
	}

}

rwthCalendar.setup();