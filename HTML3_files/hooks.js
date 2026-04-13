var coLocRWTHHooks = {
    cmid      :"2ffcbd19458c4f53e33959800393b7abfd510675",
    cmpath    :"XHZA",
    path      :"/RWTHonline/co/loc/rwth/hooks/c/XHZA",
    url       :"https://online.rwth-aachen.de/RWTHonline/co/loc/rwth/hooks/c/XHZA",
    // Find an index Row (by NR) in the CO 2.0 Navigator Table
     findNavRow: function (section,group){
        var navTable=document.getElementById("idPageNavi");
        var sectionCnt=0;
        var groupCnt=0;
        var row;        
        if (navTable!=null){
            for (var cnt = 0; row = navTable.rows[cnt]; cnt++) {                
                if(row.className=="coNavSection") {
                    sectionCnt++;
                    groupCnt=0;
                }
                if (row.className=="coNavGroup") groupCnt++;                
                if ((sectionCnt==section) && (groupCnt==group)) return row;
            }
        }
        return null;
    },
    // Find an index Link Column in the CO 2.0 Navigator Table
    findNavCell: function (section,group){
        var navRow=this.findNavRow(section,group);
        if (navRow!=null) {
            var cells=navRow.getElementsByTagName("td");
            return cells[0];
        }        
    },

    findNewNavCell: function(section,group){
        return document.querySelector("nav .mat-mdc-tab-links");
    },

    addNavLinkCO20 : function(section,group,href,text,title,index,navCell){
        var id="inserted_"+index;
        if (document.getElementById(id)!=null) return document.getElementById(id);
            var link=document.createElement("a");
            link.innerText=text;
            link.href=href;
            link.title=title;

            var anchors=[];
            var search=document.evaluate("a",navCell);        
            while (x=search.iterateNext()) anchors.push(x);
                        
            if (anchors.length==0){            
                //This is the first link in this row
                navCell.appendChild(link);
            }
            else if (index>=0){
                // Insert left 
                // Counting is 1 based but arrray is 0 based. 
                var idx=index-1;
                if (idx>anchors.length) navCell.appendChild(link);
                else navCell.insertBefore(link,anchors[idx]);
            }
            else if (index<0){                            
                //Insert Right. No insertAfter in DOM ...            
                var idx=anchors.length+index+1;
                if(idx<0) navCell.insertBefore(link,anchors[0]);
                if (idx>=anchors.length) navCell.appendChild(link);            
                else navCell.insertBefore(link,anchors[idx]);
            }
            return link;
    },

    addNavLinkCOEE : function(section,group,href,text,title,index,navCell){        
        //For now we only suppot adding at >1
        var id="inserted_"+index;
        if (index<1) index=2;
        if (document.getElementById(id)!=null) return document.getElementById(id);
        
        var link=document.createElement("a");        
        link.innerHTML=`<span class="mdc-tab__ripple"></span><div mat-ripple="" class="mat-ripple mat-mdc-tab-ripple"></div><span class="mdc-tab__content"><span class="mdc-tab__text-label"> ${text} </span></span><span class="mdc-tab-indicator"><span class="mdc-tab-indicator__content mdc-tab-indicator__content--underline"></span></span>`;        
        link.href=href;
        link.title=title;        
        link.id=id;
        link.class="mdc-tab mat-mdc-tab-link mat-mdc-focus-indicator";

        var anchors=[];
        var search=document.evaluate("a",navCell);        
        while (x=search.iterateNext()) anchors.push(x);
                    
        if (anchors.length==0){            
            //This is the first link in this row
            navCell.appendChild(link);
        }
        else if (index>=0){
            // Insert left 
            // Counting is 1 based but arrray is 0 based. 
            var idx=index-1;
            if (idx>anchors.length) navCell.appendChild(link);
            else navCell.insertBefore(link,anchors[idx]);
        }
        else if (index<0){                            
            //Insert Right. No insertAfter in DOM ...            
            var idx=anchors.length+index+1;
            if(idx<0) navCell.insertBefore(link,anchors[0]);
            if (idx>=anchors.length) navCell.appendChild(link);            
            else navCell.insertBefore(link,anchors[idx]);
        }

        return link;
    },

    //Add a link to the navigator
    addNavLink : function(section,group,href,text,title,index){        
        var navCell=coLocRWTHHooks.findNavCell(section,group);
        if (navCell!=null) return coLocRWTHHooks.addNavLinkCO20(section,group,href,text,title,index,navCell);
        navCell=coLocRWTHHooks.findNewNavCell(section,group);

        if (navCell!=null) {            
            return coLocRWTHHooks.addNavLinkCOEE(section,group,href,text,title,index,navCell);
        }        
    },
    // Load a script into the page
    loadScript: function(url,callback)
    {   
        var head = document.getElementsByTagName('head')[0];
        var script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = url;
        if (callback){
          script.addEventListener('load',callback,{ once: true });
        }
        head.appendChild(script);
    },
    //Setup rwth Hooks 
    setup : function() {
        var href=window.location.pathname;
        if (!href.startsWith("/")){
            href=href+"/";
        }      
        // CO 2.0 is case insensitive and pretty inconsistent with casing
        href=href.toLowerCase();
                
        //Remove Context
        href=href.replace(/\$ctx[^/]*\//g, "");
        //Remove unwanted chars
        href=href.replace(/[^-_a-zA-Z0-9./]*/g, "");
        //Add .js suffix
        if (href.endsWith("/")) href=href+"index.js";
        else href=href+".js";

        //Add unmangled prefix
        href = coLocRWTHHooks.url+href;        
        coLocRWTHHooks.loadScript(href);              
    }     
}

// Global Helper Object for HTM;L Editor
var coLocHtmlEditor = {
    ckEditorLocation:coLocRWTHHooks.url+"/ckeditor/ckeditor.js",
    //Name of the buttons causing a resync on mousedown
    ckEditorMaskActionName:"pMaskAction",
    
    //ID of an Icon causing a resync on click
    ckEditorMaskActionID:"-1",
    editorInterval:0,
    editorActive:false, // this is the on/off for the editor
    addTriggers: function() {
        var elementList = document.getElementsByName(coLocHtmlEditor.ckEditorMaskActionName);
        for ( var i=0; i<elementList.length; i++ )
        {
            elementList[i].addEventListener("mousedown", coLocHtmlEditor.syncEditors);            
        }
        
        var plusIcon = document.getElementById(coLocHtmlEditor.ckEditorMaskActionID);
        
        if (plusIcon != null)
        {
            plusIcon.addEventListener( "click", coLocHtmlEditor.syncEditors );
        }
        
    },
    checkEditor: function(){
        if (typeof CKEDITOR=='undefined') return; //CKEditor is not yet loaded
        if (coLocHtmlEditor.editorActive){
            coLocHtmlEditor.addTriggers();
            var textAreas = [];
            var editors={};
            
            textAreas = document.querySelectorAll("textarea:not([style='display: none;'])");
            
            // We need a lookup from source textAreas to Editor for this area to avoid 
            // double initializing an editor. The following stament seems to return this 
            //editors=CKEDITOR.instances; 
            // However it is not clear if this is a stable API. Since we need to 
            // walk all editors anyway to sync back their content we can build the lookup too
            
            for(var instanceName in CKEDITOR.instances) {                                
                var ed=CKEDITOR.instances[instanceName]; // Get Editor ref
                if (ed.elementMode==CKEDITOR.ELEMENT_MODE_REPLACE){
                    // This Editor instance replaced another element. Assume this was done by this function                        // 
                    var i=ed.element.$.id;
                    editors[i]=ed; // Store reference to edtior using the original element ID
                    
                    // Check if the editor is dirty. if yes, write content back to text area and reset dirty                
                    if (ed.checkDirty()){
                        ed.updateElement();
                        ed.resetDirty();                            
                    }
                    
                }
            }
            // Finally check all text areas, and initialize CKEditor for those who do not have an Editor active
            for ( var i=0; i<textAreas.length; i++ )
            {
                if (!(textAreas[i].id in editors))
                    CKEDITOR.replace(textAreas[i] );                            
            }
        }
    },
    syncEditors: function() {            
        // Get all editors. those created by replacing an element will be syced if dirty
        for(var instanceName in CKEDITOR.instances) {            
            var ed=CKEDITOR.instances[instanceName];
            if (ed.elementMode==CKEDITOR.ELEMENT_MODE_REPLACE){                                    
                // Check if the editor is dirty. if yes, write content back to text area and reset dirty
                if (ed.checkDirty()){
                    ed.updateElement();
                    ed.resetDirty();                        
                }
            }
            
        }                    
    },
    setup : function() {
        if ( coLocHtmlEditor.editorActive)
        {                     
            coLocRWTHHooks.loadScript(coLocHtmlEditor.ckEditorLocation,function() {
                coLocHtmlEditor.checkEditor();
                if (coLocHtmlEditor.editorInterval>0) {
                  setInterval(coLocHtmlEditor.checkEditor,coLocHtmlEditor.editorInterval);
                }
            }); 
        
        }
    }
}

var coLocRWTHDiva = {
    detailLink   : "/RWTHonline/co/loc/rwth/diva/app/examiner/details/",
    appLink      : "/RWTHonline/co/loc/rwth/diva/app",
    icon_l       : coLocRWTHHooks.path+"/img/diva/icon_l.png",
    icon_m       : coLocRWTHHooks.path+"/img/diva/icon_m.png",
    icon_s       : coLocRWTHHooks.path+"/img/diva/icon_s.png",
    isDivaAbsArb : function (absArbNR){
        if (isNaN(absArbNR)) return false;
        return true;
    },

}

coLocRWTHHooks.setup();
