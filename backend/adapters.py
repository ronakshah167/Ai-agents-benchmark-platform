"""Fixture-only coding and browser adapters, with no live-site actions."""
import ast
import operator
from pathlib import Path
import os

class PatchFixture:
    """SWE-bench-style fix task with separate held-out assertion inputs."""
    operators={ast.Add:operator.add,ast.Sub:operator.sub,ast.Mult:operator.mul}
    def setup(self,task):
        return task['buggy']
    def run(self,agent,task,env,seed):
        proposal=agent({'issue':task['issue'],'expression':env},seed)
        if not isinstance(proposal,str) or len(proposal)>80:
            return {'error':'invalid patch'}
        try:
            tree=ast.parse(proposal,mode='eval')
        except SyntaxError:
            return {'error':'invalid patch'}
        if len(list(ast.walk(tree)))>20:
            return {'error':'patch too complex'}
        return {'patch':proposal}
    def grade(self,trace,task):
        if 'patch' not in trace:
            return False
        def interpret(node,x):
            if isinstance(node,ast.Name) and node.id=='x':
                return x
            if isinstance(node,ast.Constant) and type(node.value) is int and abs(node.value)<=1000:
                return node.value
            if isinstance(node,ast.BinOp) and type(node.op) in self.operators:
                return self.operators[type(node.op)](interpret(node.left,x),interpret(node.right,x))
            raise ValueError('Unsupported expression')
        try:
            tree=ast.parse(trace['patch'],mode='eval')
            return all(interpret(tree.body,x)==expected for x,expected in task['assertions'])
        except ValueError:
            return False
    def teardown(self,env):
        pass

class BrowserFixture:
    """WebArena-style form workflow. Only explicit actions on the local fixture are supported."""
    def setup(self,task):
        from playwright.sync_api import sync_playwright
        context=sync_playwright().start()
        try:
            options={'headless':True}
            if binary:=os.environ.get('BENCH_CHROMIUM'):
                options['executable_path']=binary
            browser=context.chromium.launch(**options)
            page=browser.new_page(java_script_enabled=True)
            page.route('**/*',lambda route:route.abort())
            page.set_default_timeout(2000)
            page.set_content(Path(__file__).with_name('browser_fixture.html').read_text())
            return context,browser,page
        except BaseException:
            context.stop()
            raise
    def run(self,agent,task,env,seed):
        _,_,page=env
        actions=agent({'instruction':task['instruction'],'fields':['name','region','save']},seed)
        trace=[]
        for action,target,value in actions[:8]:
            if action=='fill' and target=='name':
                page.locator('#name').fill(str(value)[:80])
            elif action=='select' and target=='region' and value in ('west','east'):
                page.locator('#region').select_option(value)
            elif action=='click' and target=='save':
                page.locator('#save').click()
            else:
                return {'actions':trace,'error':'unsupported action'}
            trace.append([action,target,value])
        return {'actions':trace,'state':page.locator('#state').inner_text()}
    def grade(self,trace,task):
        return trace.get('state')==task['expected']
    def teardown(self,env):
        context,browser,_=env
        try:
            browser.close()
        finally:
            context.stop()
